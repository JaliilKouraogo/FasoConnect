// Administrative state only. No message plaintext or cryptographic client keys.
import { createHash } from "node:crypto";
export async function revoke(deps, op) {
  const { matrix, identity, store, operator } = deps;
  const checkpoint = async () => store.save(op);
  try {
    if (!op.rooms) {
      const joined = await matrix(
        "GET",
        `/_synapse/admin/v1/users/${encodeURIComponent(op.user)}/joined_rooms`,
      );
      const active = store.activeRooms
        ? await store.activeRooms(joined.joined_rooms)
        : joined.joined_rooms;
      op.rooms = active.map((id) => ({ old: id }));
      await store.freeze(op);
      await checkpoint();
    }
    if (!op.identityStopped) {
      if (!op.device) await identity.disable(op.username);
      await identity.logout(op.username);
      op.identityStopped = true;
      await checkpoint();
    }
    if (!op.tokensStopped) {
      if (op.device)
        await matrix(
          "DELETE",
          `/_synapse/admin/v2/users/${encodeURIComponent(op.user)}/devices/${encodeURIComponent(op.device)}`,
          {},
        );
      else
        await matrix(
          "POST",
          `/_synapse/admin/v1/deactivate/${encodeURIComponent(op.user)}`,
          { erase: false },
        );
      op.tokensStopped = true;
      await checkpoint();
    }
    for (const room of op.rooms) {
      if (room.done) continue;
      if (!room.members) {
        const state = await matrix(
          "GET",
          `/_synapse/admin/v1/rooms/${encodeURIComponent(room.old)}/state`,
        );
        room.members = state.state
          .filter(
            (e) =>
              e.type === "m.room.member" && e.content.membership === "join",
          )
          .map((e) => e.state_key)
          .filter((u) => u !== operator && (op.device || u !== op.user));
        room.powers =
          state.state.find((e) => e.type === "m.room.power_levels")?.content ||
          {};
        await checkpoint();
      }
      if (room.members.length) {
        // Use an existing member's identity for room state only. This server token has no E2EE keys/device.
        const creator = room.members
          .slice()
          .sort(
            (a, b) =>
              (room.powers.users?.[b] || 0) - (room.powers.users?.[a] || 0),
          )[0];
        const login = await matrix(
          "POST",
          `/_synapse/admin/v1/users/${encodeURIComponent(creator)}/login`,
          { valid_until_ms: Date.now() + 120000 },
        );
        try {
          if (!room.next) {
            const alias =
              "faso_" +
              op.id.replaceAll("-", "") +
              "_" +
              createHash("sha256").update(room.old).digest("hex").slice(0, 16);
            try {
              const resolved = await matrix(
                "GET",
                "/_matrix/client/v3/directory/room/" +
                  encodeURIComponent(
                    "#" + alias + ":" + op.user.split(":").slice(1).join(":"),
                  ),
              );
              const creation = await matrix(
                "GET",
                "/_matrix/client/v3/rooms/" +
                  encodeURIComponent(resolved.room_id) +
                  "/state/m.room.create",
                undefined,
                login.access_token,
              );
              if (creation["bf.faso.revocation"] !== op.id)
                throw new Error("SUCCESSOR_ALIAS_CONFLICT");
              room.next = resolved.room_id;
              await checkpoint();
            } catch (error) {
              if (error.status !== 404) throw error;
            }
            if (!room.next) {
              const created = await matrix(
                "POST",
                "/_matrix/client/v3/createRoom",
                {
                  preset: "private_chat",
                  visibility: "private",
                  room_alias_name: alias,
                  name: "Conversation renouvelée",
                  invite: room.members.filter((u) => u !== creator),
                  creation_content: {
                    "m.federate": false,
                    "bf.faso.revocation": op.id,
                  },
                  power_level_content_override: {
                    users: Object.fromEntries(
                      room.members.map((u) => [
                        u,
                        u === creator ? 100 : room.powers.users?.[u] || 0,
                      ]),
                    ),
                    events_default: 0,
                    state_default: 50,
                    invite: 50,
                    kick: 50,
                    ban: 50,
                  },
                  initial_state: [
                    {
                      type: "m.room.encryption",
                      state_key: "",
                      content: { algorithm: "m.megolm.v1.aes-sha2" },
                    },
                    {
                      type: "m.room.history_visibility",
                      state_key: "",
                      content: { history_visibility: "joined" },
                    },
                  ],
                },
                login.access_token,
              );
              room.next = created.room_id;
              await checkpoint();
            }
          }
          // Optional Matrix upgrade navigation uses an existing member's rights only.
          // The security barrier is the persistent freeze and the new room ID.
          try {
            await matrix(
              "PUT",
              `/_matrix/client/v3/rooms/${encodeURIComponent(room.old)}/state/m.room.tombstone`,
              {
                body: "Conversation renouvelée après révocation.",
                replacement_room: room.next,
              },
              login.access_token,
            );
            room.navigation = "tombstone";
          } catch {
            room.navigation = "invitation";
          }
        } finally {
          await matrix(
            "POST",
            "/_matrix/client/v3/logout",
            {},
            login.access_token,
          );
        }
        // The operator never joins the successor and never receives a message encryption key.
      }
      room.done = true;
      await checkpoint();
    }
    const devices = await matrix(
      "GET",
      `/_synapse/admin/v2/users/${encodeURIComponent(op.user)}/devices`,
    );
    if (devices.devices.some((d) => !op.device || d.device_id === op.device))
      throw new Error("DEVICE_STILL_ACTIVE");
    op.status = "effective";
    op.effectiveAt = Date.now();
    op.elapsedMs = op.effectiveAt - op.startedAt;
    delete op.error;
  } catch (error) {
    op.status = "partial";
    op.error = String(error.code || error.message).slice(0, 120);
  }
  await checkpoint();
  return op;
}
