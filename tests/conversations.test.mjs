import test from "node:test";
import assert from "node:assert/strict";
import {
  selectedInvitees,
  waitForSyncedRoom,
  partitionConversations,
} from "../client/src/conversations.js";
const directory = [{ id: "agent.beta" }, { id: "responsable.gamma" }];
test("Les doublons de conversation sont rangés sans supprimer ni mélanger les groupes nommés", () => {
  const rooms = [
    { id: 1, key: "peer" },
    { id: 2, key: "peer" },
    { id: 3, key: null },
    { id: 4, key: "other", frozen: true },
  ];
  const result = partitionConversations(
    rooms,
    (r) => r.frozen,
    (r) => r.key,
  );
  assert.deepEqual(
    result.active.map((r) => r.id),
    [1, 3],
  );
  assert.deepEqual(
    result.archived.map((r) => r.id),
    [2, 4],
  );
  assert.equal(result.active.length + result.archived.length, rooms.length);
});
test("Le créateur ne s’invite pas lui-même et les doublons ne créent pas plusieurs invitations", () => {
  assert.deepEqual(
    selectedInvitees(
      ["responsable.gamma", "agent.beta", "agent.beta"],
      "responsable.gamma",
      directory,
      true,
    ),
    ["agent.beta"],
  );
  assert.throws(() =>
    selectedInvitees(
      ["responsable.gamma"],
      "responsable.gamma",
      directory,
      true,
    ),
  );
  assert.throws(() =>
    selectedInvitees(["inconnu"], "responsable.gamma", directory, true),
  );
});
test("Un agent reste limité à une conversation avec un collègue", () => {
  assert.throws(() =>
    selectedInvitees(
      ["agent.beta", "responsable.gamma"],
      "autre",
      directory,
      false,
    ),
  );
});
test("Un salon créé n’est ouvert qu’après réception de son état chiffré par la synchronisation", async () => {
  let room;
  const pending = waitForSyncedRoom({ getRoom: () => room }, "!test", 1000);
  setTimeout(
    () =>
      (room = {
        getMyMembership: () => "join",
        hasEncryptionStateEvent: () => true,
      }),
    20,
  );
  assert.equal(await pending, room);
  await assert.rejects(
    waitForSyncedRoom(
      {
        getRoom: () => ({
          getMyMembership: () => "join",
          hasEncryptionStateEvent: () => false,
        }),
      },
      "!test",
      10,
    ),
    /synchronisation/,
  );
});
