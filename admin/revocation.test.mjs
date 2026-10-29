import test from "node:test";
import assert from "node:assert/strict";
import { revoke } from "./revocation.mjs";

test("A failure during identity logout cannot report an effective revocation", async () => {
  let frozen = false,
    deleted = false;
  const states = [];
  const op = {
    id: "test",
    username: "agent.alpha",
    user: "@agent.alpha:local",
    startedAt: Date.now(),
  };
  await revoke(
    {
      operator: "@operator:local",
      matrix: async (method, path) => {
        if (path.endsWith("/joined_rooms"))
          return { joined_rooms: ["!test:local"] };
        deleted = true;
        return {};
      },
      identity: {
        disable: async () => {},
        logout: async () => {
          throw new Error("IDENTITY_UNAVAILABLE");
        },
      },
      store: {
        freeze: async () => {
          frozen = true;
        },
        save: async (o) => states.push(structuredClone(o)),
      },
    },
    op,
  );
  assert(frozen);
  assert(!deleted);
  assert.equal(op.status, "partial");
  assert(!op.effectiveAt);
  assert(states.some((s) => s.status === "partial"));
});
test("A supposedly deleted device still listed by the server blocks completion", async () => {
  const op = {
    id: "test",
    username: "agent.alpha",
    user: "@agent.alpha:local",
    device: "LOST",
    startedAt: Date.now(),
  };
  let disabled = false;
  await revoke(
    {
      operator: "@operator:local",
      matrix: async (method, path) =>
        path.endsWith("/joined_rooms")
          ? { joined_rooms: [] }
          : path.endsWith("/devices")
            ? { devices: [{ device_id: "LOST" }] }
            : {},
      identity: {
        disable: async () => {
          disabled = true;
        },
        logout: async () => {},
      },
      store: { freeze: async () => {}, save: async () => {} },
    },
    op,
  );
  assert.equal(op.status, "partial");
  assert.equal(op.error, "DEVICE_STILL_ACTIVE");
  assert(!disabled);
  assert(!op.effectiveAt);
});
test("Resuming a partial operation keeps old rooms frozen and reuses its successor", async () => {
  let creations = 0;
  const op = {
    id: "test",
    username: "agent.alpha",
    user: "@agent.alpha:local",
    startedAt: Date.now(),
    rooms: [
      {
        old: "!old:local",
        next: "!new:local",
        members: ["@responsable:local"],
        powers: { users: { "@responsable:local": 100 } },
      },
    ],
    identityStopped: true,
    tokensStopped: true,
    status: "partial",
  };
  await revoke(
    {
      operator: "@operator:local",
      matrix: async (method, path) => {
        if (path.endsWith("/createRoom")) creations++;
        if (path.endsWith("/login")) return { access_token: "synthetic" };
        if (path.endsWith("/devices")) return { devices: [] };
        return {};
      },
      identity: {
        disable: async () => {
          throw Error("unexpected");
        },
        logout: async () => {},
      },
      store: {
        freeze: async () => {
          throw Error("unexpected unfreeze");
        },
        save: async () => {},
      },
    },
    op,
  );
  assert.equal(creations, 0);
  assert.equal(op.rooms[0].next, "!new:local");
  assert.equal(op.status, "effective");
});
