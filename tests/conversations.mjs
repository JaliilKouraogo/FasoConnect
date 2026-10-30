// Deux salons fictifs ; tous les participants les quittent après la recette.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as sdk from "matrix-js-sdk";
import { fixturePath } from "./fixtures.mjs";
import {
  waitForSyncedRoom,
  selectedInvitees,
} from "../client/src/conversations.js";
const all = JSON.parse(await readFile(fixturePath(".test-sessions.json")));
const extra = JSON.parse(
  await readFile(fixturePath(".test-extra-sessions.json")),
);
const actor = all["responsable.gamma"],
  recipient = Object.values(extra)[0];
const quiet = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  getChild() {
    return this;
  },
};
const client = sdk.createClient({
  baseUrl: "https://localhost",
  accessToken: actor.access_token,
  userId: actor.user_id,
  deviceId: actor.device_id,
  logger: quiet,
});
async function api(session, path, body) {
  const response = await fetch("https://localhost/_matrix/client/v3/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + session.access_token,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert(response.ok, "Action Matrix refusée : " + response.status);
  return response.json();
}
const created = [];
try {
  await api(recipient, "account/whoami");
  const self = actor.user_id.split(":")[0].slice(1),
    peer = recipient.user_id.split(":")[0].slice(1);
  const ids = selectedInvitees(
    [self, peer, peer],
    self,
    [{ id: self }, { id: peer }],
    true,
  );
  assert.deepEqual(ids, [peer]);
  const first = await client.createRoom({
    name: "Recette temporaire création",
    preset: "private_chat",
    invite: [recipient.user_id],
    creation_content: { "m.federate": false },
  });
  created.push(first.room_id);
  await client.startClient({ initialSyncLimit: 0 });
  const room = await waitForSyncedRoom(client, first.room_id, 30000);
  assert(room.hasEncryptionStateEvent());
  await api(recipient, "join/" + encodeURIComponent(first.room_id), {});
  const member = await api(
    actor,
    "rooms/" +
      encodeURIComponent(first.room_id) +
      "/state/m.room.member/" +
      encodeURIComponent(recipient.user_id),
  );
  assert.equal(member.membership, "join");
  console.log(
    "PASS création SDK, synchronisation chiffrée, invitation initiale et acceptation réelles",
  );
  const second = await client.createRoom({
    name: "Recette temporaire invitation",
    preset: "private_chat",
    creation_content: { "m.federate": false },
  });
  created.push(second.room_id);
  await waitForSyncedRoom(client, second.room_id);
  await client.invite(second.room_id, recipient.user_id);
  const invited = await api(
    actor,
    "rooms/" +
      encodeURIComponent(second.room_id) +
      "/state/m.room.member/" +
      encodeURIComponent(recipient.user_id),
  );
  assert.equal(invited.membership, "invite");
  console.log("PASS invitation explicite dans un salon existant");
} finally {
  for (const id of created) {
    await api(
      recipient,
      "rooms/" + encodeURIComponent(id) + "/leave",
      {},
    ).catch(() => {});
    await client.leave(id).catch(() => {});
  }
  client.stopClient();
}
