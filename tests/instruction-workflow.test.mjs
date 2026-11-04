import test from "node:test";
import assert from "node:assert/strict";
import {
  instructionProgress,
  WORKFLOW_EVENT,
} from "../client/src/instruction-workflow.js";
const instruction = {
  id: "$instruction",
  roomId: "!dossier:local",
  sender: "@chef:local",
  content: { recipients: ["@alpha:local", "@beta:local"] },
};
const alpha = "@alpha:local",
  beta = "@beta:local",
  chef = instruction.sender;
const action = (id, sender, status, previous = instruction.id, extra = {}) => ({
  id,
  sender,
  roomId: instruction.roomId,
  encrypted: true,
  type: WORKFLOW_EVENT,
  content: {
    instruction_id: instruction.id,
    recipient: alpha,
    status,
    previous_id: previous,
    ...extra,
  },
});

test("Chaque exécutant avance son travail ; seul l'auteur valide une soumission", () => {
  const events = [
    action("$a", alpha, "en_cours"),
    action("$b", alpha, "a_valider", "$a"),
    action("$c", chef, "termine", "$b"),
  ];
  const result = instructionProgress(instruction, events);
  assert.equal(result.items[0].status, "termine");
  assert.equal(result.items[1].status, "a_faire");
  assert.equal(result.completed, 1);
  assert.equal(result.closed, false);
});

test("Usurpation, validation prématurée, événement en clair et mauvais salon sont ignorés", () => {
  for (const event of [
    action("$x", beta, "en_cours"),
    action("$x", chef, "termine"),
    { ...action("$x", alpha, "en_cours"), encrypted: false },
    { ...action("$x", alpha, "en_cours"), roomId: "!autre:local" },
    action("$x", alpha, "en_cours", instruction.id, {
      instruction_id: "$autre",
    }),
  ]) {
    assert.equal(
      instructionProgress(instruction, [event]).items[0].status,
      "a_faire",
    );
  }
});

test("Une demande de reprise motivée permet une nouvelle soumission", () => {
  const events = [
    action("$a", alpha, "en_cours"),
    action("$b", alpha, "a_valider", "$a"),
    action("$c", chef, "a_reprendre", "$b", {
      comment: "Compléter le résultat",
    }),
    action("$d", alpha, "en_cours", "$c"),
    action("$e", alpha, "a_valider", "$d"),
  ];
  assert.equal(
    instructionProgress(instruction, events.reverse()).items[0].status,
    "a_valider",
  );
  events.find((e) => e.id === "$c").content.comment = "";
  assert.notEqual(
    instructionProgress(instruction, events).items[0].status,
    "termine",
  );
});

test("Les doublons sont dédupliqués et les événements hors ordre suivent leurs références", () => {
  const a = action("$a", alpha, "en_cours");
  const alias = action("$aa", alpha, "en_cours");
  const b = action("$b", alpha, "a_valider", alias.id);
  const events = [b, alias, a, a, action("$c", chef, "termine", b.id)];
  assert.equal(instructionProgress(instruction, events).completed, 1);
  assert.equal(instructionProgress(instruction, events.reverse()).completed, 1);
});

test("Deux décisions concurrentes ne produisent jamais une fausse clôture", () => {
  const events = [
    action("$a", alpha, "en_cours"),
    action("$b", alpha, "a_valider", "$a"),
    action("$c", chef, "termine", "$b"),
    action("$d", chef, "a_reprendre", "$b", { comment: "À compléter" }),
  ];
  const result = instructionProgress(instruction, events);
  assert.equal(result.items[0].conflict, true);
  assert.equal(result.completed, 0);
  assert.equal(result.incomplete, true);
});

test("Une référence manquante signale un historique incomplet", () => {
  const result = instructionProgress(instruction, [
    action("$c", chef, "termine", "$absent"),
  ]);
  assert.equal(result.incomplete, true);
  assert.equal(result.closed, false);
});

test("Un compte ne valide pas son propre travail à la place du responsable", () => {
  const result = instructionProgress(instruction, [
    action("$a", alpha, "en_cours"),
    action("$b", alpha, "a_valider", "$a"),
    action("$c", alpha, "termine", "$b"),
  ]);
  assert.equal(result.items[0].status, "a_valider");
});
