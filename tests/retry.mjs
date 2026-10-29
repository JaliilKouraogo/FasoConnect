import { fixturePath, privateFile, project } from "./fixtures.mjs";
import { readFile } from "node:fs/promises";
const a = JSON.parse(await readFile(fixturePath(".test-admin.json")));
const headers = {
  Cookie: a.cookie,
  Origin: "https://localhost",
  "X-CSRF-Token": a.csrf,
  "Content-Type": "application/json",
};
const ops = await (
  await fetch("https://localhost/admin/api/revocations", { headers })
).json();
const op = ops.find((o) => o.status === "partial");
if (!op) throw Error("Opération partielle absente");
let r = await fetch("https://localhost/admin/api/retry", {
  method: "POST",
  headers,
  body: JSON.stringify({ id: op.id }),
});
console.log("Reprise", r.status);
if (r.status !== 202) console.log(await r.text());
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const list = await (
    await fetch("https://localhost/admin/api/revocations", { headers })
  ).json();
  const current = list.find((o) => o.id === op.id);
  if (current.status === "effective") {
    console.log(
      "PASS reprise effective ; salons traités",
      current.rooms.length,
    );
    break;
  }
  if (current.status === "partial" && current.error !== op.error) {
    console.log("PARTIAL", current.error);
    break;
  }
}
