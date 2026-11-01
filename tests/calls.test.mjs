import test from "node:test";
import assert from "node:assert/strict";
import {
  CALL_EVENT,
  directCallPeer,
  newCallId,
  validateCallSignal,
} from "../client/src/calls.js";

test("Les signaux d'appel ont une forme limitée et explicite", () => {
  assert.equal(CALL_EVENT, "bf.fasoconnect.call");
  assert.equal(
    validateCallSignal({
      call_id: "call_0123456789abcdef012345",
      action: "invite",
      media: "video",
    }),
    true,
  );
  assert.equal(
    validateCallSignal({
      call_id: "call_0123456789abcdef012345",
      action: "offer",
      media: "audio",
      description: { type: "offer", sdp: "v=0" },
    }),
    true,
  );
  assert.equal(
    validateCallSignal({
      call_id: "call_0123456789abcdef012345",
      action: "offer",
      media: "audio",
      description: { type: "answer", sdp: "v=0" },
    }),
    false,
  );
  assert.equal(
    validateCallSignal({
      call_id: "call_0123456789abcdef012345",
      action: "hangup",
      media: "video",
      extra: "ignored",
    }),
    true,
  );
});

test("Un appel ne choisit un pair que dans une conversation privée", () => {
  const room = {
    getMembers: () => [
      { userId: "@moi:local", membership: "join" },
      { userId: "@autre:local", membership: "join" },
    ],
  };
  assert.equal(directCallPeer(room, "@moi:local"), "@autre:local");
  assert.equal(
    directCallPeer(
      { getMembers: () => [...room.getMembers(), { userId: "@trois:local", membership: "join" }] },
      "@moi:local",
    ),
    null,
  );
});

test("Un identifiant d'appel est aléatoire et compatible avec la validation", () => {
  const id = newCallId(() => 0.5);
  assert.match(id, /^call_[a-f0-9]{36}$/);
  assert.equal(
    validateCallSignal({ call_id: id, action: "invite", media: "audio" }),
    true,
  );
});
