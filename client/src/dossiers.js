export const DOSSIER_EVENT = "bf.fasoconnect.dossier";
export const DOSSIER_NOTE_EVENT = "bf.fasoconnect.dossier.note";
const text = (value, max) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
export function validateDossier(event, context) {
  const c = event.content;
  return Boolean(
    event.type === DOSSIER_EVENT &&
      event.encrypted === true &&
      event.id?.startsWith("$") &&
      event.roomId === context.roomId &&
      context.members.includes(event.sender) &&
      context.managers.includes(event.sender) &&
      text(c?.reference, 60) &&
      text(c?.title, 120) &&
      (c.description === undefined ||
        (typeof c.description === "string" && c.description.length <= 4000)),
  );
}
export function validateDossierNote(event, dossier, context) {
  return Boolean(
    event.type === DOSSIER_NOTE_EVENT &&
      event.encrypted === true &&
      event.id?.startsWith("$") &&
      event.roomId === dossier.roomId &&
      context.members.includes(event.sender) &&
      event.content?.dossier_id === dossier.id &&
      text(event.content?.body, 4000),
  );
}
