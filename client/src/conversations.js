export function selectedInvitees(ids, self, directory, allowGroup) {
  const known = new Set(directory.map((x) => x.id));
  const selected = [...new Set(ids)].filter((id) => id !== self);
  if (!selected.length) throw new Error("Choisissez au moins un collègue.");
  if (selected.some((id) => !known.has(id)))
    throw new Error(
      "Un collègue sélectionné n’est plus disponible. Actualisez l’annuaire.",
    );
  if (!allowGroup && selected.length > 1)
    throw new Error(
      "Choisissez un seul collègue pour une conversation privée.",
    );
  if (selected.length > 15)
    throw new Error("Un groupe est limité à 15 invités à la création.");
  return selected;
}

// createRoom termine sa requête avant que /sync ait nécessairement livré le salon.
export async function waitForSyncedRoom(client, id, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const room = client.getRoom(id);
    if (room?.getMyMembership() === "join" && room.hasEncryptionStateEvent())
      return room;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "La conversation a été créée, mais sa synchronisation prend du temps. Retrouvez-la dans la liste sans la recréer.",
  );
}

export function partitionConversations(rooms, isArchived, directKey) {
  const active = [],
    archived = [],
    seen = new Set();
  for (const room of rooms) {
    const key = directKey(room);
    if (isArchived(room) || (key && seen.has(key))) archived.push(room);
    else {
      active.push(room);
      if (key) seen.add(key);
    }
  }
  return { active, archived };
}
