import { fixturePath, privateFile, project } from "./fixtures.mjs";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const sessions = JSON.parse(await readFile(fixturePath(".test-sessions.json"))),
  a = JSON.parse(await readFile(fixturePath(".test-admin.json"))),
  lost = sessions["agent.beta"];
const headers = {
  Cookie: a.cookie,
  Origin: "https://localhost",
  "X-CSRF-Token": a.csrf,
  "Content-Type": "application/json",
};
assert.equal(
  (
    await fetch("https://localhost/_matrix/client/v3/account/whoami", {
      headers: { Authorization: "Bearer " + lost.access_token },
    })
  ).status,
  200,
);
const r = await fetch("https://localhost/admin/api/revoke", {
  method: "POST",
  headers,
  body: JSON.stringify({ username: "agent.beta", device: lost.device_id }),
});
assert.equal(r.status, 202, await r.clone().text());
const op = await r.json();
let complete;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 500));
  complete = (
    await (
      await fetch("https://localhost/admin/api/revocations", { headers })
    ).json()
  ).find((o) => o.id === op.id);
  if (complete.status === "partial") throw Error(complete.error);
  if (complete.status === "effective") break;
}
assert.equal(complete.status, "effective");
assert.equal(
  (
    await fetch("https://localhost/_matrix/client/v3/sync?timeout=0", {
      headers: { Authorization: "Bearer " + lost.access_token },
    })
  ).status,
  401,
);
const agents = await (
  await fetch("https://localhost/admin/api/agents", { headers })
).json();
assert.equal(agents.find((u) => u.username === "agent.beta").enabled, true);
await writeFile(
  fixturePath(".test-lost-device-proof.json"),
  JSON.stringify({
    elapsedMs: complete.elapsedMs,
    roomCount: complete.rooms.length,
    sessionRejected: true,
    accountRemainsEnabled: true,
  }),
);
console.log(
  "PASS appareil perdu : jeton refusé, compte maintenu actif, salons renouvelés en " +
    complete.elapsedMs +
    " ms.",
);
