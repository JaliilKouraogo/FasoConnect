"""Fail closed: only allowlisted state events and encrypted room payloads."""
class EncryptedOnly:
    def __init__(self, config, api):
        self.api = api
        api.register_third_party_rules_callbacks(check_event_allowed=self.check_event_allowed, on_create_room=self.on_create_room)
    async def role(self, user_id):
        def check(txn):
            txn.execute('SELECT role FROM faso_agent_roles WHERE user_id = %s', (user_id,))
            row = txn.fetchone()
            return row[0] if row else None
        return await self.api.run_db_interaction('faso_role_check', check)
    async def on_create_room(self, requester, request_content, is_requester_admin):
        from synapse.api.errors import SynapseError
        role = await self.role(requester.user.to_string())
        if role is None or (len(request_content.get('invite', [])) > 1 and role not in {'responsable', 'administrateur'}):
            raise SynapseError(403, 'Un responsable est requis pour créer un groupe institutionnel.')
        request_content['visibility'] = 'private'
        request_content['preset'] = 'private_chat'
        request_content.setdefault('creation_content', {})['m.federate'] = False
        initial = [e for e in request_content.get('initial_state', []) if e['type'] not in {'m.room.encryption', 'm.room.history_visibility'}]
        initial.extend([
            {'type':'m.room.encryption','state_key':'','content':{'algorithm':'m.megolm.v1.aes-sha2'}},
            {'type':'m.room.history_visibility','state_key':'','content':{'history_visibility':'joined'}},
        ])
        request_content['initial_state'] = initial
    async def frozen(self, room_id):
        def check(txn):
            txn.execute('SELECT 1 FROM faso_frozen_rooms WHERE room_id = %s', (room_id,))
            return txn.fetchone() is not None
        return await self.api.run_db_interaction('faso_freeze_check', check)
    async def check_event_allowed(self, event, state_events):
        state = {"m.room.create", "m.room.member", "m.room.power_levels", "m.room.join_rules", "m.room.history_visibility", "m.room.guest_access", "m.room.encryption", "m.room.name", "m.room.topic", "m.room.avatar", "m.room.canonical_alias", "m.room.server_acl", "m.room.tombstone"}
        if event.is_state():
            if event.type not in state:
                return False, None
            if event.type == "m.room.encryption":
                return event.content.get("algorithm") == "m.megolm.v1.aes-sha2", None
            if event.type == "m.room.join_rules":
                return event.content.get("join_rule") == "invite", None
            if event.type == "m.room.history_visibility":
                return event.content.get("history_visibility") in {"joined", "invited"}, None
            if event.type == 'm.room.member' and event.content.get('membership') == 'invite':
                members = {e.state_key for (kind, key), e in state_events.items() if kind == 'm.room.member' and e.content.get('membership') in {'join','invite'}}
                members.add(event.state_key)
                if len(members) > 2 and await self.role(event.sender) not in {'responsable','administrateur'}:
                    return False, None
            if event.type == 'm.room.member' and event.content.get('membership') in {'ban','leave'} and event.sender != event.state_key:
                if await self.role(event.sender) not in {'responsable','administrateur'}:
                    return False, None
            return True, None
        if await self.frozen(event.room_id):
            return False, None
        if event.type == "m.room.redaction":
            return True, None
        encrypted = state_events.get(("m.room.encryption", ""))
        return bool(event.type == "m.room.encrypted" and encrypted and event.content.get("algorithm") == "m.megolm.v1.aes-sha2"), None
