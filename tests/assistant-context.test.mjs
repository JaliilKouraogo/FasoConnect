import test from "node:test";
import assert from "node:assert/strict";
import { collectAssistantContext } from "../client/src/assistant-context.js";
function event(body, options = {}) {
  return {
    isEncrypted: () => options.encrypted !== false,
    isDecryptionFailure: () => !!options.failure,
    isRedacted: () => !!options.redacted,
    getContent: () => ({ body, msgtype: options.file ? "m.file" : "m.text" }),
    getType: () => "m.room.message",
    getSender: () => "@fictif:localhost",
    getTs: () => 0,
  };
}
test("Les fichiers, textes non chiffrés, messages effacés ou non déchiffrables ne deviennent jamais des extraits IA", () => {
  const output = collectAssistantContext(
    [
      event("à conserver"),
      event("fichier confidentiel", { file: true }),
      event("texte clair", { encrypted: false }),
      event("texte effacé", { redacted: true }),
      event("clé absente", { failure: true }),
    ],
    () => false,
  );
  assert.equal(output.length, 1);
  assert.match(output[0].text, /à conserver/);
});
test("La sélection disponible reste bornée et conserve l’ordre des messages récents", () => {
  const output = collectAssistantContext(
    Array.from({ length: 50 }, (_, i) => event("texte " + i)),
    () => false,
  );
  assert.equal(output.length, 30);
  assert.match(output[0].text, /texte 20$/);
  assert.match(output.at(-1).text, /texte 49$/);
  const long = collectAssistantContext(
    Array.from({ length: 30 }, () => event("x".repeat(3000))),
    () => false,
  );
  assert(long.every((x) => x.text.length <= 1600));
  assert(long.reduce((sum, x) => sum + x.text.length, 0) <= 12000);
});
