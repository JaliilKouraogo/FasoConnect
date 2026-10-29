import { fixturePath, privateFile, project } from "./fixtures.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import * as sdk from "matrix-js-sdk";
import loglevel from "loglevel";
loglevel.disableAll();
for (const l of Object.values(loglevel.getLoggers())) l.disableAll();
const quiet = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  getChild() {
    return this;
  },
};
const extra = JSON.parse(
    await readFile(fixturePath(".test-extra-sessions.json")),
  ),
  s = Object.values(extra)[0];
const c = sdk.createClient({
  logger: quiet,
  baseUrl: "https://localhost",
  accessToken: s.access_token,
  userId: s.user_id,
  deviceId: s.device_id,
});
const wait = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Délai de reconnexion dépassé");
};
let down = false,
  passed = false;
const compose = (...args) =>
  execFileSync(
    "docker",
    [
      "compose",
      "--env-file",
      privateFile(".env"),
      "-f",
      project + "/compose.yaml",
      ...args,
    ],
    { stdio: "pipe" },
  );
try {
  await c.initRustCrypto({ useIndexedDB: false });
  await c.startClient({ initialSyncLimit: 0 });
  await wait(() => ["PREPARED", "SYNCING"].includes(c.getSyncState()));
  const { room_id: room } = await c.createRoom({
    preset: "private_chat",
    name: "Test fictif de reconnexion",
    initial_state: [
      {
        type: "m.room.encryption",
        state_key: "",
        content: { algorithm: "m.megolm.v1.aes-sha2" },
      },
      {
        type: "m.room.history_visibility",
        state_key: "",
        content: { history_visibility: "joined" },
      },
    ],
  });
  await wait(() => c.getRoom(room)?.hasEncryptionStateEvent());
  const marker = "FASO_RECONNEXION_" + randomUUID(),
    txn = "retry_" + randomUUID();
  const first = await c.sendEvent(
    room,
    "m.room.message",
    { msgtype: "m.text", body: marker },
    txn,
  );
  const raw = await c.fetchRoomEvent(room, first.event_id);
  const url =
      "https://localhost/_matrix/client/v3/rooms/" +
      encodeURIComponent(room) +
      "/send/m.room.encrypted/" +
      txn,
    options = {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + s.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(raw.content),
    };
  compose("stop", "proxy");
  down = true;
  let refused = false;
  try {
    await fetch(url, options);
  } catch {
    refused = true;
  }
  assert(refused);
  compose("up", "-d", "proxy");
  down = false;
  await wait(async () => {
    try {
      return (await fetch("https://localhost/_matrix/client/versions")).ok;
    } catch {
      return false;
    }
  });
  const retry = await (await fetch(url, options)).json();
  assert.equal(retry.event_id, first.event_id);
  const after = await c.fetchRoomEvent(room, first.event_id);
  assert.equal(after.type, "m.room.encrypted");
  assert(!JSON.stringify(after).includes(marker));
  await writeFile(
    fixturePath(".test-reconnection-proof.json"),
    JSON.stringify({
      interruptionObserved: true,
      sameEventAfterRetry: true,
      encryptedEventPreserved: true,
    }),
  );
  console.log(
    "PASS coupure réelle du proxy, reprise avec le même identifiant de transaction, aucun doublon et événement chiffré conservé.",
  );
  passed = true;
} catch (error) {
  console.error(
    "FAIL reconnexion : " + (error.errcode || error.code || error.message),
  );
} finally {
  if (down) compose("up", "-d", "proxy");
  c.stopClient();
  setTimeout(() => process.exit(passed ? 0 : 1), 1000);
}
