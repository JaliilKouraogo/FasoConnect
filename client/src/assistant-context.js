// Aucun chargement distant : uniquement les textes déjà déchiffrés de la timeline.
export function collectAssistantContext(events, isValidInstruction) {
  const context = [];
  let length = 0;
  for (const event of [...events].reverse()) {
    if (
      !event.isEncrypted() ||
      event.isDecryptionFailure() ||
      event.isRedacted()
    )
      continue;
    const c = event.getContent();
    if (
      !(
        (event.getType() === "m.room.message" &&
          ["m.text", "m.notice"].includes(c.msgtype)) ||
        isValidInstruction(event)
      )
    )
      continue;
    if (typeof c.body !== "string" || !c.body.trim()) continue;
    const text =
      `${event.getSender()} · ${new Date(event.getTs()).toLocaleString("fr-FR")}\n${c.subject ? c.subject + "\n" : ""}${c.body}`.slice(
        0,
        1600,
      );
    if (length + text.length > 12000 || context.length >= 30) break;
    context.unshift({ text });
    length += text.length;
  }
  return context;
}
