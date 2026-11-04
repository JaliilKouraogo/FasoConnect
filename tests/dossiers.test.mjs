import test from "node:test";
import assert from "node:assert/strict";
import {
  DOSSIER_EVENT,
  DOSSIER_NOTE_EVENT,
  validateDossier,
  validateDossierNote,
} from "../client/src/dossiers.js";
const context = {
  roomId: "!room:local",
  members: ["@chef:local", "@agent:local"],
  managers: ["@chef:local"],
};
const dossier = {
  id: "$dossier",
  roomId: context.roomId,
  sender: "@chef:local",
  encrypted: true,
  type: DOSSIER_EVENT,
  content: {
    reference: "SIM-01",
    title: "Dossier fictif",
    description: "Travail de simulation",
  },
};
test("Un dossier exige un responsable membre et des métadonnées chiffrées bornées", () => {
  assert(validateDossier(dossier, context));
  for (const change of [
    { sender: "@agent:local" },
    { encrypted: false },
    { roomId: "!other:local" },
    { content: { ...dossier.content, title: " " } },
    { content: { ...dossier.content, reference: "x".repeat(61) } },
  ])
    assert(!validateDossier({ ...dossier, ...change }, context));
});
test("Une note chiffrée est liée au dossier et à un participant autorisé", () => {
  const note = {
    id: "$note",
    roomId: context.roomId,
    sender: "@agent:local",
    encrypted: true,
    type: DOSSIER_NOTE_EVENT,
    content: { dossier_id: dossier.id, body: "Compte rendu fictif" },
  };
  assert(validateDossierNote(note, dossier, context));
  for (const change of [
    { sender: "@intrus:local" },
    { encrypted: false },
    { roomId: "!autre:local" },
    { content: { dossier_id: "$autre", body: "Texte" } },
    { content: { dossier_id: dossier.id, body: " " } },
  ])
    assert(!validateDossierNote({ ...note, ...change }, dossier, context));
});
