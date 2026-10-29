import { fixturePath, privateFile, project } from "./fixtures.mjs";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const a = JSON.parse(await readFile(fixturePath(".test-admin.json"))),
  username = "agent.recette" + Date.now().toString().slice(-8);
const headers = {
  Cookie: a.cookie,
  Origin: "https://localhost",
  "X-CSRF-Token": a.csrf,
  "Content-Type": "application/json",
};
const r = await fetch("https://localhost/admin/api/enroll", {
  method: "POST",
  headers,
  body: JSON.stringify({
    username,
    name: "Agent fictif de recette",
    role: "agent",
  }),
});
assert.equal(r.status, 201, await r.clone().text());
const result = await r.json();
assert(result.expiresAt > Date.now() && result.expiresAt < Date.now() + 901000);
const activation = async (code) =>
  fetch("https://localhost/activate", {
    method: "POST",
    headers: {
      Origin: "https://localhost",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ username, code }),
  });
assert.equal((await activation("x".repeat(43))).status, 403);
assert.equal((await activation(result.activationCode)).status, 200);
assert.equal((await activation(result.activationCode)).status, 403);
const data = JSON.parse(await readFile(privateFile(".demo-activation.json")));
data[username] = {
  temporary_password: result.temporaryPassword,
  role: "agent",
};
await writeFile(
  privateFile(".demo-activation.json"),
  JSON.stringify(data, null, 2),
);
await writeFile(
  fixturePath(".test-enrolled.json"),
  JSON.stringify({ username, expiresInMinutes: 15, singleUseVerified: true }),
);
console.log(
  "PASS enrôlement fictif : code incorrect refusé, code valable 15 minutes, activation puis réutilisation refusée.",
);
