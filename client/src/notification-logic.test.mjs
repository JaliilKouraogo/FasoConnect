import test from "node:test";
import assert from "node:assert/strict";
import { notificationKind, dueToday } from "./notification-logic.js";

const event = (type, msgtype, overrides = {}) => ({
  getSender: () => "@collegue:localhost",
  isEncrypted: () => true,
  isDecryptionFailure: () => false,
  isRedacted: () => false,
  getType: () => type,
  getContent: () => ({ msgtype, body: "Confidentiel" }),
  ...overrides,
});

test("Seuls les nouveaux contenus chiffrés d’autrui peuvent déclencher une alerte", () => {
  assert.equal(
    notificationKind(event("m.room.message", "m.text"), "@moi:localhost"),
    "messages",
  );
  assert.equal(
    notificationKind(event("bf.fasoconnect.instruction"), "@moi:localhost"),
    "instructions",
  );
  assert.equal(
    notificationKind(
      event("m.room.message", "m.text", { isEncrypted: () => false }),
      "@moi:localhost",
    ),
    null,
  );
  assert.equal(
    notificationKind(
      event("m.room.message", "m.text", { getSender: () => "@moi:localhost" }),
      "@moi:localhost",
    ),
    null,
  );
  assert.equal(
    notificationKind(
      event("m.room.message", "m.text", { isRedacted: () => true }),
      "@moi:localhost",
    ),
    null,
  );
  assert.equal(
    notificationKind(event("m.room.message", "m.location"), "@moi:localhost"),
    null,
  );
});

test("Le rappel quotidien ignore les tâches terminées et les autres dates", () => {
  const today = new Date(2026, 10, 1);
  assert.equal(
    dueToday(
      [
        { date: "2026-11-01", done: false },
        { date: "2026-11-01", done: true },
        { date: "2026-11-02", done: false },
      ],
      today,
    ),
    1,
  );
});
