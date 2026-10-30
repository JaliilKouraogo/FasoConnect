// Recette locale : textes fictifs uniquement, aucun envoi Matrix ni mutation de compte.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fixturePath } from "./fixtures.mjs";
const sessions = JSON.parse(await readFile(fixturePath(".test-sessions.json")));
const token = sessions["responsable.gamma"].access_token;
const headers = {
  Authorization: "Bearer " + token,
  "Content-Type": "application/json",
  Origin: "https://localhost",
};
const base = "https://localhost";
const post = (data, h = headers) =>
  fetch(base + "/assistant/api/run", {
    method: "POST",
    headers: h,
    body: JSON.stringify(data),
  });
assert.equal((await fetch(base + "/assistant/api/status")).status, 401);
const status = await fetch(base + "/assistant/api/status", { headers });
assert.equal(status.status, 200);
const config = await status.json();
assert.equal(config.ready, true);
assert.equal(config.model, "qwen3.5:2b");
assert.equal(config.agents.length, 4);
console.log("PASS identité requise ; quatre agents et Qwen local prêts");
const basic = {
  agent: "aide",
  prompt: "Comment inviter un collègue ?",
  excerpts: [],
};
assert.equal(
  (await post(basic, { ...headers, Origin: "https://exemple.invalid" })).status,
  403,
);
assert.equal((await post({ ...basic, agent: "cloud" })).status, 400);
assert.equal((await post({ ...basic, agent: "synthese" })).status, 400);
assert.equal(
  (
    await post({
      ...basic,
      excerpts: [{ text: "test fictif" }],
      roomId: "!absent:localhost",
    })
  ).status,
  400,
);
const revoked = sessions["agent.alpha"]?.access_token;
if (revoked)
  assert.equal(
    (
      await fetch(base + "/assistant/api/status", {
        headers: { Authorization: "Bearer " + revoked },
      })
    ).status,
    401,
  );
console.log("PASS origine, agent, accord et compte révoqué contrôlés");
const mappings = await (
  await fetch(base + "/room-successors", { headers })
).json();
if (mappings.length) {
  const blocked = await post({
    agent: "actions",
    prompt: "Quelles actions ?",
    roomId: mappings[0].old,
    consent: true,
    excerpts: [{ text: "Essai fictif" }],
  });
  assert.equal(blocked.status, 403);
}
const joined = await (
  await fetch(base + "/_matrix/client/v3/joined_rooms", { headers })
).json();
const roomId = joined.joined_rooms.find(
  (id) => !mappings.some((m) => m.old === id),
);
assert(roomId, "Une conversation active rejointe par Gamma est nécessaire.");
const examples = [
  basic,
  {
    agent: "redaction",
    prompt:
      "Rédige en deux phrases un remerciement pour un document reçu. N’invente pas de nom.",
    excerpts: [],
  },
  {
    agent: "synthese",
    prompt: "Résume ces deux extraits en citant [1] et [2].",
    roomId,
    consent: true,
    excerpts: [
      { text: "[Fictif] La réunion est fixée au 12 novembre à 10 heures." },
      { text: "[Fictif] Aminata préparera la salle avant 9 heures." },
    ],
  },
  {
    agent: "actions",
    prompt: "Relève l’action, la responsable et l’échéance avec la référence.",
    roomId,
    consent: true,
    excerpts: [
      {
        text: "[Fictif] Aminata doit transmettre le rapport vendredi avant 15 heures.",
      },
    ],
  },
];
for (const example of examples.filter(
  (x) =>
    !process.env.ASSISTANT_AGENT_FILTER ||
    x.agent === process.env.ASSISTANT_AGENT_FILTER,
)) {
  const started = Date.now(),
    response = await post(example);
  const data = await response.json();
  assert.equal(response.status, 200, data.error);
  assert.equal(data.local, true);
  assert.equal(data.model, "qwen3.5:2b");
  assert(data.answer?.length > 10);
  if (example.agent === "aide") {
    assert.match(data.answer, /conversation/i);
    assert.doesNotMatch(data.answer, /d'abord contacter l'administrateur/i);
  }
  if (["synthese", "actions"].includes(example.agent))
    assert.match(data.answer, /\[1\]/);
  console.log(
    "PASS inférence réelle " +
      example.agent +
      " en " +
      (Date.now() - started) +
      " ms : " +
      data.answer.replace(/\s+/g, " ").slice(0, 260),
  );
}
console.log("PASS agents sélectionnés sur l’API HTTPS ; aucun message envoyé");
