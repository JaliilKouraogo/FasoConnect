export const CALL_EVENT = "bf.fasoconnect.call";

const actions = new Set(["invite", "offer", "answer", "ice", "hangup"]);

export function validateCallSignal(content) {
  if (!content || typeof content !== "object") return false;
  if (
    typeof content.call_id !== "string" ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(content.call_id) ||
    typeof content.action !== "string" ||
    !actions.has(content.action) ||
    !["audio", "video"].includes(content.media)
  )
    return false;
  if (content.action === "ice")
    return (
      content.candidate &&
      typeof content.candidate === "object" &&
      typeof content.candidate.candidate === "string"
    );
  if (content.action === "invite" || content.action === "hangup") return true;
  return (
    content.description &&
    typeof content.description === "object" &&
    content.description.type === content.action &&
    typeof content.description.sdp === "string"
  );
}

export function directCallPeer(room, self) {
  const members = room
    ?.getMembers?.()
    ?.filter((member) => ["join", "invite"].includes(member.membership));
  if (!members || members.length !== 2) return null;
  return members.find((member) => member.userId !== self)?.userId || null;
}

export function newCallId(random = Math.random) {
  const bytes = Array.from({ length: 18 }, () =>
    Math.floor(random() * 256)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
  return `call_${bytes}`;
}
