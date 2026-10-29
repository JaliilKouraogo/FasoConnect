import { fixturePath, privateFile, project } from "./fixtures.mjs";
import loglevel from "loglevel";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  encryptAttachment,
  decryptAttachment,
} from "matrix-encrypt-attachment";
import * as sdk from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger.js";

loglevel.disableAll();
for (const log of Object.values(loglevel.getLoggers())) log.disableAll();
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
const credentials = JSON.parse(
  await readFile(fixturePath(".test-sessions.json")),
);
const clients = [];
let passed = false;
const wait = async (fn, label) => {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Timeout : " + label);
};
try {
  for (const name of [
    "agent.alpha",
    "agent.beta",
    "responsable.gamma",
    "agent.alpha.second",
  ]) {
    const s = credentials[name];
    assert(s?.access_token);
    const c = sdk.createClient({
      logger: quiet,
      baseUrl: "https://localhost",
      accessToken: s.access_token,
      userId: s.user_id,
      deviceId: s.device_id,
    });
    await c.initRustCrypto({ useIndexedDB: false });
    clients.push(c);
    await c.startClient({ initialSyncLimit: 10 });
    await wait(
      () => ["PREPARED", "SYNCING"].includes(c.getSyncState()),
      "sync " + name,
    );
  }
  const [a, b, g, a2] = clients;
  const { room_id: room } = await g.createRoom({
    preset: "private_chat",
    visibility: "private",
    invite: [a.getUserId(), b.getUserId()],
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
  await a.joinRoom(room);
  await b.joinRoom(room);
  await wait(
    () => clients.every((c) => c.getRoom(room)?.getJoinedMemberCount() === 3),
    "adhésion",
  );
  for (const c of clients) {
    await c.getCrypto().getUserDeviceInfo(
      clients.map((x) => x.getUserId()),
      true,
    );
    for (const other of clients)
      await c
        .getCrypto()
        .setDeviceVerified(other.getUserId(), other.getDeviceId(), true);
  }
  const marker = "FASO_E2EE_" + randomUUID(),
    txn = "f_" + randomUUID();
  const sent = await a.sendEvent(
    room,
    "m.room.message",
    { msgtype: "m.text", body: marker },
    txn,
  );
  await wait(
    () =>
      b
        .getRoom(room)
        .getLiveTimeline()
        .getEvents()
        .some((e) => e.getContent().body === marker),
    "déchiffrement destinataire",
  );
  const raw = await a.fetchRoomEvent(room, sent.event_id);
  assert.equal(raw.type, "m.room.encrypted");
  assert(!JSON.stringify(raw).includes(marker));
  const duplicate = await a.sendEvent(
    room,
    "m.room.message",
    { msgtype: "m.text", body: marker },
    txn,
  );
  assert.equal(duplicate.event_id, sent.event_id);
  const instruction = await g.sendEvent(room, "bf.fasoconnect.instruction", {
    subject: "Consigne fictive",
    body: "Réunion fictive",
    priority: "normale",
    recipients: [b.getUserId()],
  });
  await wait(
    () =>
      b
        .getRoom(room)
        .getLiveTimeline()
        .getEvents()
        .some(
          (e) =>
            e.getId() === instruction.event_id &&
            e.getType() === "bf.fasoconnect.instruction",
        ),
    "instruction déchiffrée",
  );
  const ack = await b.sendEvent(room, "bf.fasoconnect.ack", {
    instruction_id: instruction.event_id,
    acknowledged: true,
  });
  await wait(
    () =>
      g
        .getRoom(room)
        .getLiveTimeline()
        .getEvents()
        .some(
          (e) =>
            e.getId() === ack.event_id && e.getType() === "bf.fasoconnect.ack",
        ),
    "accusé déchiffré",
  );
  for (const id of [instruction.event_id, ack.event_id])
    assert.equal((await a.fetchRoomEvent(room, id)).type, "m.room.encrypted");
  await writeFile(
    fixturePath(".test-context.json"),
    JSON.stringify({ room, marker, event: sent.event_id }),
  );
  const fileBytes = new TextEncoder().encode("FASO_FICHIER_" + randomUUID());
  const encrypted = await encryptAttachment(fileBytes.buffer);
  const upload = await a.uploadContent(new Blob([encrypted.data]), {
    type: "application/octet-stream",
    includeFilename: false,
  });
  const fileEvent = await a.sendEvent(room, "m.room.message", {
    msgtype: "m.file",
    body: "temoin-fictif.txt",
    file: { ...encrypted.info, url: upload.content_uri },
  });
  await wait(
    () =>
      b
        .getRoom(room)
        .getLiveTimeline()
        .getEvents()
        .some((e) => e.getId() === fileEvent.event_id && e.getContent().file),
    "fichier chiffré",
  );
  const media = upload.content_uri.slice(6).split("/");
  const mediaPath =
    "/_matrix/client/v1/media/download/" +
    media.map(encodeURIComponent).join("/");
  const downloaded = await fetch("https://localhost" + mediaPath, {
    headers: {
      Authorization: "Bearer " + credentials["agent.beta"].access_token,
    },
  });
  assert(downloaded.ok);
  const cipher = await downloaded.arrayBuffer();
  assert(!Buffer.from(cipher).equals(Buffer.from(fileBytes)));
  const plain = await decryptAttachment(cipher, {
    ...encrypted.info,
    url: upload.content_uri,
  });
  assert(Buffer.from(plain).equals(Buffer.from(fileBytes)));
  const clear = await fetch(
    "https://localhost/_matrix/client/v3/rooms/" +
      encodeURIComponent(room) +
      "/send/m.room.message/clear_" +
      randomUUID(),
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + credentials["agent.beta"].access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ msgtype: "m.text", body: "INTERDIT" }),
    },
  );
  assert.equal(clear.status, 403);
  const directory = await fetch("https://localhost/directory", {
    headers: {
      Authorization: "Bearer " + credentials["agent.beta"].access_token,
    },
  });
  assert(directory.ok);
  assert.equal((await fetch("https://localhost/admin/api/agents")).status, 401);
  console.log(
    "PASS : fichier chiffré au transfert, déchiffrement local identique, refus du clair, annuaire authentifié, administration anonyme refusée.",
  );
  const admin = JSON.parse(await readFile(fixturePath(".test-admin.json")));
  const request = await fetch("https://localhost/admin/api/revoke", {
    method: "POST",
    headers: {
      Cookie: admin.cookie,
      Origin: "https://localhost",
      "X-CSRF-Token": admin.csrf,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username: "agent.alpha" }),
  });
  assert.equal(
    request.status,
    202,
    JSON.stringify(await request.clone().json()),
  );
  const operation = await request.json();
  let complete;
  await wait(async () => {
    const r = await fetch("https://localhost/admin/api/revocations", {
      headers: { Cookie: admin.cookie },
    });
    const ops = await r.json();
    complete = ops.find((o) => o.id === operation.id);
    if (complete?.status === "partial")
      throw new Error("Révocation partielle : " + complete.error);
    return complete?.status === "effective";
  }, "révocation");
  for (const name of ["agent.alpha", "agent.alpha.second"]) {
    const auth = { Authorization: "Bearer " + credentials[name].access_token };
    assert.equal(
      (
        await fetch("https://localhost/_matrix/client/v3/sync?timeout=0", {
          headers: auth,
        })
      ).status,
      401,
    );
    assert.equal(
      (await fetch("https://localhost" + mediaPath, { headers: auth })).status,
      401,
    );
  }
  const successor = complete.rooms.find((r) => r.old === room)?.next;
  assert(successor);
  await b.joinRoom(successor);
  await wait(
    () => g.getRoom(successor)?.getJoinedMemberCount() === 2,
    "successeur",
  );
  const nextMarker = "APRES_REVOCATION_" + randomUUID();
  const next = await g.sendTextMessage(successor, nextMarker);
  await wait(
    () =>
      b
        .getRoom(successor)
        ?.getLiveTimeline()
        .getEvents()
        .some((e) => e.getContent().body === nextMarker),
    "nouveau message",
  );
  const nextRaw = await g.fetchRoomEvent(successor, next.event_id);
  for (const c of [a, a2]) {
    const stolen = new sdk.MatrixEvent(nextRaw);
    await c.decryptEventIfNeeded(stolen);
    assert(
      stolen.isDecryptionFailure(),
      "Un appareil révoqué a déchiffré le successeur",
    );
  }
  await writeFile(
    fixturePath(".test-proof.json"),
    JSON.stringify({
      operation: complete.id,
      elapsedMs: complete.elapsedMs,
      room,
      successor,
      marker,
      nextMarker,
      fileMarker: new TextDecoder().decode(fileBytes),
    }),
  );
  console.log(
    "PASS : révocation effective en " +
      complete.elapsedMs +
      " ms ; deux appareils refusés à sync et médias ; membres restants communiquent ; les deux anciens appareils échouent à déchiffrer le nouvel événement.",
  );
  passed = true;
  console.log(
    "PASS : 3 clients Rust crypto, groupe privé, message déchiffré, stockage événement chiffré, idempotence, instruction et accusé chiffrés.",
  );
} catch (error) {
  console.error(
    "FAIL recette : " + (error.errcode || error.code || error.message),
  );
} finally {
  for (const c of clients) c.stopClient();
  setTimeout(() => process.exit(passed ? 0 : 1), 1000);
}
