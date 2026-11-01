export function validateInstruction(event, context) {
  const c = event.content;
  return Boolean(
    event.roomId === context.roomId &&
      context.members.includes(event.sender) &&
      ["responsable", "administrateur"].includes(context.role) &&
      context.power >= 50 &&
      c &&
      typeof c.subject === "string" &&
      c.subject.length > 0 &&
      c.subject.length <= 200 &&
      typeof c.body === "string" &&
      c.body.length > 0 &&
      c.body.length <= 16000 &&
      ["normale", "haute", "urgente"].includes(c.priority) &&
      Array.isArray(c.recipients) &&
      c.recipients.length > 0 &&
      c.recipients.length <= 200 &&
      new Set(c.recipients).size === c.recipients.length &&
      c.recipients.every(
        (id) =>
          typeof id === "string" &&
          context.members.includes(id) &&
          id !== event.sender,
      ) &&
      (!c.deadline || Number.isFinite(Date.parse(c.deadline))) &&
      (c.dossier_id === undefined ||
        (typeof c.dossier_id === "string" &&
          c.dossier_id.startsWith("$") &&
          c.dossier_id.length <= 255)) &&
      (c.dossier === undefined ||
        (typeof c.dossier === "string" &&
          c.dossier.trim().length > 0 &&
          c.dossier.length <= 120)),
  );
}
export function validateAcknowledgement(event, instruction) {
  return Boolean(
    event.roomId === instruction.roomId &&
      event.content?.instruction_id === instruction.id &&
      event.content.acknowledged === true &&
      instruction.content.recipients.includes(event.sender),
  );
}
