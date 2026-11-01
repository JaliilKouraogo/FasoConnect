import { gzipSync } from "node:zlib";
import { readdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
for (const name of await readdir("dist/assets")) {
  if (/\.(js|css|wasm)$/.test(name))
    await writeFile(
      "dist/assets/" + name + ".gz",
      gzipSync(await readFile("dist/assets/" + name), { level: 9 }),
    );
}
const assets = [
  "/service/",
  "/service/icon.svg",
  "/service/logo-full.png",
  "/service/logo-mark.png",
  "/service/manifest.webmanifest",
  ...(await readdir("dist/assets"))
    .filter((x) => /\.(js|css|wasm)$/.test(x))
    .map((x) => "/service/assets/" + x),
];
const revision = createHash("sha256")
  .update(await readFile("dist/index.html"))
  .digest("hex")
  .slice(0, 16);
await writeFile(
  "dist/sw.js",
  `const NAME='faso-static-${revision}',FILES=${JSON.stringify(assets)};self.addEventListener('install',e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(FILES))));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('faso-static-')&&k!==NAME).map(k=>caches.delete(k))))));self.addEventListener('message',e=>{if(e.data==='ACTIVATE_APPROVED')self.skipWaiting()});self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method==='GET'&&u.origin===self.location.origin&&!u.search&&FILES.includes(u.pathname))e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});`,
);
