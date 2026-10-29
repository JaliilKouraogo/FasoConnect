import test from "node:test";
import assert from "node:assert/strict";
import {
  validateInstruction,
  validateAcknowledgement,
} from "../client/src/instructions.js";
const event = {
  roomId: "!group:local",
  sender: "@responsable:local",
  content: {
    subject: "Consigne fictive",
    body: "Contenu fictif",
    priority: "normale",
    recipients: ["@agent:local"],
  },
};
const context = {
  roomId: event.roomId,
  members: [event.sender, "@agent:local"],
  role: "responsable",
  power: 50,
};
test("Only an authorized responsible member can publish a coherent instruction", () => {
  assert(validateInstruction(event, context));
  for (const bad of [
    { ...context, role: "agent" },
    { ...context, power: 0 },
    { ...context, roomId: "!other:local" },
    { ...context, members: ["@agent:local"] },
  ])
    assert(!validateInstruction(event, bad));
});
test("Recipients must be unique members, and the priority must be recognized", () => {
  for (const content of [
    { ...event.content, recipients: ["@outsider:local"] },
    { ...event.content, recipients: ["@agent:local", "@agent:local"] },
    { ...event.content, priority: "fake" },
  ])
    assert(!validateInstruction({ ...event, content }, context));
});
test("An acknowledgement is bound to the instruction, its room, and an actual recipient", () => {
  const instruction = { ...event, id: "$id" };
  const ack = {
    roomId: event.roomId,
    sender: "@agent:local",
    content: { instruction_id: "$id", acknowledged: true },
  };
  assert(validateAcknowledgement(ack, instruction));
  assert(
    !validateAcknowledgement(
      { ...ack, sender: "@impostor:local" },
      instruction,
    ),
  );
  assert(
    !validateAcknowledgement({ ...ack, roomId: "!other:local" }, instruction),
  );
  assert(
    !validateAcknowledgement(
      { ...ack, content: { instruction_id: "$different", acknowledged: true } },
      instruction,
    ),
  );
});
