import { fixturePath, privateFile, project } from "./fixtures.mjs";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const extra = JSON.parse(
    await readFile(fixturePath(".test-extra-sessions.json")),
  ),
  s = Object.values(extra)[0],
  all = JSON.parse(await readFile(fixturePath(".test-sessions.json"))),
  g = all["responsable.gamma"];
const headers = {
  Authorization: "Bearer " + s.access_token,
  "Content-Type": "application/json",
};
const mappings = await (
  await fetch("https://localhost/room-successors", {
    headers: { Authorization: "Bearer " + g.access_token },
  })
).json();
assert(mappings.length);
const unauthorized = await fetch(
  "https://localhost/_matrix/client/v3/join/" +
    encodeURIComponent(mappings.at(-1).next),
  { method: "POST", headers, body: "{}" },
);
assert.equal(unauthorized.status, 403);
const group = await fetch("https://localhost/_matrix/client/v3/createRoom", {
  method: "POST",
  headers,
  body: JSON.stringify({
    invite: ["@agent.beta:localhost", "@responsable.gamma:localhost"],
    preset: "private_chat",
  }),
});
assert.equal(group.status, 403);
const direct = await fetch("https://localhost/_matrix/client/v3/createRoom", {
  method: "POST",
  headers,
  body: JSON.stringify({
    invite: ["@responsable.gamma:localhost"],
    preset: "private_chat",
    visibility: "public",
  }),
});
assert.equal(direct.status, 200, await direct.clone().text());
const { room_id: room } = await direct.json();
for (const [type, field, value] of [
  ["m.room.encryption", "algorithm", "m.megolm.v1.aes-sha2"],
  ["m.room.join_rules", "join_rule", "invite"],
  ["m.room.history_visibility", "history_visibility", "joined"],
]) {
  const r = await fetch(
    "https://localhost/_matrix/client/v3/rooms/" +
      encodeURIComponent(room) +
      "/state/" +
      type,
    { headers },
  );
  assert.equal((await r.json())[field], value);
}
assert.equal(
  (await fetch("https://localhost/_matrix/federation/v1/version")).status,
  403,
);
assert.equal(
  (await fetch("https://localhost/_synapse/admin/v1/server_version")).status,
  403,
);
assert.equal((await fetch("https://localhost/directory")).status, 401);
const guest = await fetch(
  "https://localhost/_matrix/client/v3/register?kind=guest",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  },
);
assert([400, 403].includes(guest.status));
const unknown = await fetch("https://localhost/_matrix/client/v3/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "m.login.password",
    identifier: { type: "m.id.user", user: "non.enrole" },
    password: "fictif",
  }),
});
assert([400, 401, 403].includes(unknown.status));
console.log(
  "PASS : groupe sans invitation refusé, rôle agent limité, création forcée en privé/chiffré/historique joined, invités et login local refusés, fédération et API admin directe bloquées.",
);
