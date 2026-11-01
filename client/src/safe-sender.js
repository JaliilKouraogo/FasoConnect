// Les tentatives et leurs identifiants restent en mémoire ; aucun renvoi automatique.
export function createSafeSender(client, authorize) {
  const attempts = new Map();
  return {
    async send(roomId, type, content) {
      await authorize(roomId);
      const key = JSON.stringify([roomId, type, content]);
      let txn = attempts.get(key);
      if (!txn) {
        if (attempts.size >= 50)
          throw new Error(
            "Trop d’envois en attente. Réessayez les messages existants avant d’en créer d’autres.",
          );
        txn = client.makeTxnId();
        attempts.set(key, txn);
      }
      const room = client.getRoom(roomId),
        pending = room?.getEventForTxnId(txn);
      let result;
      if (
        pending &&
        ["sending", "encrypting", "queued"].includes(pending.status)
      )
        throw new Error("Cette tentative est encore en cours.");
      if (
        pending?.getId()?.startsWith("$") &&
        (!pending.status || pending.status === "sent")
      )
        result = { event_id: pending.getId() };
      else if (pending?.status === "not_sent")
        result = await client.resendEvent(pending, room);
      else result = await client.sendEvent(roomId, type, content, txn);
      attempts.delete(key);
      return result;
    },
    discard(roomId, type, content) {
      const key = JSON.stringify([roomId, type, content]),
        txn = attempts.get(key);
      if (!txn) return;
      const event = client.getRoom(roomId)?.getEventForTxnId(txn);
      if (event && ["not_sent", "queued", "encrypting"].includes(event.status))
        client.cancelPendingEvent(event);
      attempts.delete(key);
    },
    clear(roomId) {
      for (const [key, txn] of attempts) {
        const [target] = JSON.parse(key);
        if (roomId && target !== roomId) continue;
        const event = client.getRoom(target)?.getEventForTxnId(txn);
        if (
          event &&
          ["not_sent", "queued", "encrypting"].includes(event.status)
        )
          client.cancelPendingEvent(event);
        attempts.delete(key);
      }
    },
  };
}
