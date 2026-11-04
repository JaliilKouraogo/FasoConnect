// État métier reconstruit uniquement à partir d'événements Matrix déchiffrés.
export const WORKFLOW_EVENT = "bf.fasoconnect.progress";
export const WORKFLOW_LABELS = Object.freeze({
  a_faire: "À faire",
  en_cours: "En cours",
  a_valider: "À valider",
  a_reprendre: "À reprendre",
  termine: "Validé",
});

export function allowedTransitions(state, actor, instruction, recipient) {
  if (actor === recipient) {
    if (["a_faire", "a_reprendre"].includes(state)) return ["en_cours"];
    if (state === "en_cours") return ["a_valider"];
  }
  if (actor === instruction.sender && state === "a_valider")
    return ["termine", "a_reprendre"];
  return [];
}

export function instructionProgress(instruction, events) {
  const content = instruction.content;
  const recipients = [...new Set(content.recipients)];
  const relevant = events.filter((event) => {
    const c = event.content;
    return (
      event.type === WORKFLOW_EVENT &&
      event.encrypted === true &&
      typeof event.id === "string" &&
      event.id.startsWith("$") &&
      event.roomId === instruction.roomId &&
      c?.instruction_id === instruction.id &&
      recipients.includes(c.recipient) &&
      typeof c.previous_id === "string" &&
      Object.hasOwn(WORKFLOW_LABELS, c.status) &&
      c.status !== "a_faire" &&
      (c.comment === undefined ||
        (typeof c.comment === "string" && c.comment.length <= 2000)) &&
      (c.status !== "a_reprendre" || Boolean(c.comment?.trim()))
    );
  });
  // Ne jamais laisser un même identifiant porter plusieurs contenus contradictoires.
  const unique = new Map();
  const inconsistent = new Set();
  for (const event of relevant) {
    const signature = JSON.stringify([event.sender, event.content]);
    if (unique.has(event.id) && unique.get(event.id).signature !== signature)
      inconsistent.add(event.id);
    unique.set(event.id, { event, signature });
  }
  const entries = [...unique.values()]
    .map((x) => x.event)
    .sort((a, b) => a.id.localeCompare(b.id));
  const items = recipients.map((recipient) => {
    let status = "a_faire",
      previousId = instruction.id,
      conflict = false;
    let frontier = new Set([instruction.id]);
    const history = [],
      consumed = new Set();
    const own = entries.filter((e) => e.content.recipient === recipient);
    for (let step = 0; step <= own.length; step++) {
      const next = own.filter(
        (event) =>
          !consumed.has(event.id) &&
          frontier.has(event.content.previous_id) &&
          allowedTransitions(
            status,
            event.sender,
            instruction,
            recipient,
          ).includes(event.content.status),
      );
      if (!next.length) break;
      const fingerprints = new Set(
        next.map((e) =>
          JSON.stringify([e.sender, e.content.status, e.content.comment || ""]),
        ),
      );
      if (fingerprints.size > 1 || next.some((e) => inconsistent.has(e.id))) {
        conflict = true;
        break;
      }
      // Les doublons logiques sont des alias du même changement, sans double compteur.
      frontier = new Set(next.map((e) => e.id));
      next.forEach((e) => consumed.add(e.id));
      const chosen = next[0];
      status = chosen.content.status;
      previousId = chosen.id;
      history.push(chosen);
    }
    const knownIds = new Set([instruction.id, ...own.map((e) => e.id)]);
    const missingHistory = own.some(
      (event) =>
        !knownIds.has(event.content.previous_id) &&
        [recipient, instruction.sender].includes(event.sender),
    );
    return { recipient, status, previousId, history, conflict, missingHistory };
  });
  const incomplete = items.some((x) => x.conflict || x.missingHistory);
  return {
    items,
    incomplete,
    completed: items.filter(
      (x) => x.status === "termine" && !x.conflict && !x.missingHistory,
    ).length,
    closed:
      recipients.length > 0 &&
      !incomplete &&
      items.every((x) => x.status === "termine"),
  };
}
