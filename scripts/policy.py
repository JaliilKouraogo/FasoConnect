"""Fail closed: only allowlisted state events and encrypted room payloads."""
class EncryptedOnly:
    def __init__(self, config, api):
        api.register_third_party_rules_callbacks(check_event_allowed=self.check_event_allowed)
    async def check_event_allowed(self, event, state_events):
        state = {"m.room.create", "m.room.member", "m.room.power_levels", "m.room.join_rules", "m.room.history_visibility", "m.room.guest_access", "m.room.encryption", "m.room.name", "m.room.topic", "m.room.avatar", "m.room.canonical_alias", "m.room.server_acl"}
        if event.is_state():
            if event.type not in state:
                return False, None
            if event.type == "m.room.encryption":
                return event.content.get("algorithm") == "m.megolm.v1.aes-sha2", None
            if event.type == "m.room.join_rules":
                return event.content.get("join_rule") == "invite", None
            if event.type == "m.room.history_visibility":
                return event.content.get("history_visibility") in {"joined", "invited"}, None
            return True, None
        if event.type == "m.room.redaction":
            return True, None
        encrypted = state_events.get(("m.room.encryption", ""))
        return bool(event.type == "m.room.encrypted" and encrypted and event.content.get("algorithm") == "m.megolm.v1.aes-sha2"), None
