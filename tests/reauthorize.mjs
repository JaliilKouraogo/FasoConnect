import { fixturePath, privateFile, project } from "./fixtures.mjs";
import { readFile, writeFile } from "node:fs/promises";
const a = JSON.parse(await readFile(fixturePath(".test-admin.json")));
const r = await fetch("https://localhost/admin/api/reauthorize", {
  method: "POST",
  headers: {
    Cookie: a.cookie,
    Origin: "https://localhost",
    "X-CSRF-Token": a.csrf,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ username: "agent.alpha" }),
});
if (!r.ok) throw Error("Réautorisation " + r.status + " " + (await r.text()));
const result = await r.json();
const data = JSON.parse(await readFile(privateFile(".demo-activation.json")));
data["agent.alpha"] = {
  temporary_password: result.temporaryPassword,
  role: "agent",
};
await writeFile(
  privateFile(".demo-activation.json"),
  JSON.stringify(data, null, 2),
);
console.log(
  "PASS réautorisation contrôlée ; nouvelle activation TOTP requise.",
);
