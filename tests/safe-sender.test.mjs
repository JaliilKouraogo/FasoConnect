import test from "node:test";
import assert from "node:assert/strict";
import { createSafeSender } from "../client/src/safe-sender.js";
test("Abandonner une tentative libère son événement sans toucher aux autres salons", async () => {
  const events = new Map(),
    cancelled = [];
  let counter = 0;
  const client = {
    makeTxnId: () => `txn${counter++}`,
    getRoom: (room) => ({ getEventForTxnId: (txn) => events.get(room + txn) }),
    async sendEvent(room, type, content, txn) {
      events.set(room + txn, { status: "not_sent", room });
      throw Error("Coupure");
    },
    cancelPendingEvent: (event) => cancelled.push(event.room),
  };
  const sender = createSafeSender(client, async () => {});
  await assert.rejects(sender.send("!a", "m.room.message", { body: "test" }));
  await assert.rejects(sender.send("!b", "m.room.message", { body: "test" }));
  sender.discard("!a", "m.room.message", { body: "test" });
  assert.deepEqual(cancelled, ["!a"]);
  sender.clear("!b");
  assert.deepEqual(cancelled, ["!a", "!b"]);
});
test("Une nouvelle tentative réutilise l'événement Matrix et recontrôle les droits", async () => {
  let pending,
    allowed = 0,
    sent = 0,
    retried = 0;
  const room = { getEventForTxnId: () => pending };
  const client = {
    makeTxnId: () => "txn1",
    getRoom: () => room,
    async sendEvent(r, t, c, txn) {
      sent++;
      assert.equal(txn, "txn1");
      pending = { status: "not_sent", getId: () => "~pending" };
      throw Error("Réseau");
    },
    async resendEvent(event, target) {
      retried++;
      assert.equal(event, pending);
      assert.equal(target, room);
      return { event_id: "$ok" };
    },
  };
  const sender = createSafeSender(client, async () => allowed++);
  await assert.rejects(sender.send("!r", "m.room.message", { body: "fictif" }));
  await sender.send("!r", "m.room.message", { body: "fictif" });
  assert.equal(sent, 1);
  assert.equal(retried, 1);
  assert.equal(allowed, 2);
});
test("Un compte révoqué ne peut pas reprendre une tentative conservée", async () => {
  let revoked = false,
    sent = 0;
  const sender = createSafeSender(
    {
      makeTxnId: () => "txn",
      getRoom: () => ({ getEventForTxnId: () => null }),
      async sendEvent() {
        sent++;
        throw Error("Réseau");
      },
    },
    async () => {
      if (revoked) throw Error("Révoqué");
    },
  );
  await assert.rejects(sender.send("!r", "m.room.message", { body: "fictif" }));
  revoked = true;
  await assert.rejects(
    sender.send("!r", "m.room.message", { body: "fictif" }),
    /Révoqué/,
  );
  assert.equal(sent, 1);
});
test("La même transaction est conservée si aucune réponse ni écho n'a été reçu", async () => {
  const ids = [];
  let count = 0;
  const sender = createSafeSender(
    {
      makeTxnId: () => "stable",
      getRoom: () => ({ getEventForTxnId: () => null }),
      async sendEvent(r, t, c, txn) {
        ids.push(txn);
        if (!count++) throw Error("Coupure");
        return { event_id: "$ok" };
      },
    },
    async () => {},
  );
  await assert.rejects(sender.send("!r", "m.room.message", { body: "test" }));
  await sender.send("!r", "m.room.message", { body: "test" });
  assert.deepEqual(ids, ["stable", "stable"]);
});
