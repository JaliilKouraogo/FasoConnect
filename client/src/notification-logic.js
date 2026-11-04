export function notificationKind(event, userId) {
  if (
    !event ||
    event.getSender?.() === userId ||
    !event.isEncrypted?.() ||
    event.isDecryptionFailure?.() ||
    event.isRedacted?.()
  )
    return null;
  const type = event.getType?.();
  if (type === "bf.fasoconnect.instruction") return "instructions";
  if (type === "m.room.message") {
    const messageType = event.getContent?.()?.msgtype;
    return ["m.text", "m.notice", "m.file", "m.image", "m.audio"].includes(
      messageType,
    )
      ? "messages"
      : null;
  }
  return null;
}

export function dueToday(tasks, today) {
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return tasks.filter((task) => task.date === key && !task.done).length;
}
