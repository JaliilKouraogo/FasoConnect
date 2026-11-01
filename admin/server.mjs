import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, createHmac, randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import * as oidc from "openid-client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { revoke } from "./revocation.mjs";
import { createAssistant, validateRequest } from "./assistant.mjs";

const origin = "https://" + process.env.DOMAIN;
const issuer = origin + "/auth/realms/fasoconnect";
const internal = "https://identity.localhost/auth/realms/fasoconnect";
const config = new oidc.Configuration(
  {
    issuer,
    authorization_endpoint: issuer + "/protocol/openid-connect/auth",
    token_endpoint: internal + "/protocol/openid-connect/token",
    jwks_uri: internal + "/protocol/openid-connect/certs",
    response_types_supported: ["code"],
    id_token_signing_alg_values_supported: ["RS256"],
  },
  "faso-admin",
  process.env.ADMIN_OIDC_SECRET,
);
const jwks = createRemoteJWKSet(
  new URL(internal + "/protocol/openid-connect/certs"),
);
const pool = new Pool({
  host: "db",
  user: "synapse",
  database: "synapse",
  password: process.env.POSTGRES_PASSWORD,
});
const assistant = createAssistant();
const sessions = new Map();
const pending = new Map();
const running = new Set();
const attempts = new Map();
let adminToken,
  serviceToken,
  serviceUntil = 0;
const operator = "@faso-operator:" + process.env.DOMAIN;
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const enc = encodeURIComponent;
async function jsonFetch(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new HttpError(r.status, "UPSTREAM_" + r.status);
  if (r.status === 204) return {};
  const text = await r.text();
  return text ? JSON.parse(text) : {};
}
async function getAdminToken() {
  if (adminToken) return adminToken;
  try {
    adminToken = (await readFile("/admin-auth/operator-token", "utf8")).trim();
    return adminToken;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const secret = (
    await readFile("/admin-auth/registration.secret", "utf8")
  ).trim();
  const { nonce } = await jsonFetch(
    "http://synapse:8008/_synapse/admin/v1/register",
  );
  const username = "faso-operator",
    password = randomBytes(48).toString("hex");
  const mac = createHmac("sha1", secret)
    .update([nonce, username, password, "admin"].join("\0"))
    .digest("hex");
  const result = await jsonFetch(
    "http://synapse:8008/_synapse/admin/v1/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce, username, password, admin: true, mac }),
    },
  );
  adminToken = result.access_token;
  await writeFile("/admin-auth/operator-token", adminToken, { mode: 0o600 });
  return adminToken;
}
async function matrix(method, path, data, token) {
  const authorization = token || (await getAdminToken());
  return jsonFetch("http://synapse:8008" + path, {
    method,
    headers: {
      Authorization: "Bearer " + authorization,
      "Content-Type": "application/json",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function service() {
  if (serviceToken && Date.now() < serviceUntil) return serviceToken;
  const result = await jsonFetch(internal + "/protocol/openid-connect/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "faso-provisioner",
      client_secret: process.env.PROVISIONER_SECRET,
    }),
  });
  serviceToken = result.access_token;
  serviceUntil = Date.now() + (result.expires_in - 15) * 1000;
  return serviceToken;
}
async function kc(method, path, data) {
  return jsonFetch(
    "http://identity:8080/auth/admin/realms/fasoconnect" + path,
    {
      method,
      headers: {
        Authorization: "Bearer " + (await service()),
        "Content-Type": "application/json",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    },
  );
}
async function findUser(name) {
  const list = await kc("GET", "/users?exact=true&username=" + enc(name));
  if (list.length !== 1) throw new HttpError(404, "AGENT_INTROUVABLE");
  return list[0];
}
const identity = {
  disable: async (name) => {
    const u = await findUser(name);
    await kc("PUT", "/users/" + u.id, { enabled: false });
  },
  logout: async (name) => {
    const u = await findUser(name);
    await kc("POST", "/users/" + u.id + "/logout");
  },
};
const store = {
  activeRooms: async (ids) => {
    const frozen = new Set(
      (
        await pool.query(
          "SELECT room_id FROM faso_frozen_rooms WHERE room_id=ANY($1)",
          [ids],
        )
      ).rows.map((r) => r.room_id),
    );
    return ids.filter((id) => !frozen.has(id));
  },
  save: async (op) => {
    await pool.query(
      "INSERT INTO faso_revocations(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      [op.id, op],
    );
  },
  freeze: async (op) => {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      for (const r of op.rooms)
        await db.query(
          "INSERT INTO faso_frozen_rooms(room_id,operation_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [r.old, op.id],
        );
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  },
};
function startOperation(op) {
  if (running.has(op.id)) return;
  running.add(op.id);
  revoke({ matrix, identity, store, operator }, op).finally(() =>
    running.delete(op.id),
  );
}
async function body(req, limit = 8192) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw new HttpError(413, "REQUETE_TROP_LONGUE");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "JSON_INVALIDE");
  }
}
function sid(req) {
  return req.headers.cookie
    ?.split("; ")
    .find((v) => v.startsWith("faso_admin="))
    ?.slice(11);
}
function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(typeof data === "string" ? data : JSON.stringify(data));
}
async function session(req, fresh = false) {
  const s = sessions.get(sid(req));
  if (!s || Date.now() > s.expires)
    throw new HttpError(401, "CONNEXION_REQUISE");
  const u = await kc("GET", "/users/" + s.sub);
  if (!u.enabled) throw new HttpError(401, "COMPTE_REVOQUE");
  const roles = await kc("GET", "/users/" + s.sub + "/role-mappings/realm");
  if (!roles.some((r) => r.name === "administrateur"))
    throw new HttpError(403, "ROLE_ADMINISTRATEUR_REQUIS");
  if (fresh && Date.now() - s.authAt > 120000)
    throw new HttpError(401, "REAUTHENTIFICATION_REQUISE");
  if (
    req.method !== "GET" &&
    (req.headers.origin !== origin || req.headers["x-csrf-token"] !== s.csrf)
  )
    throw new HttpError(403, "CSRF");
  return s;
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin),
      path = url.pathname;
    if (path === "/health") return send(res, 200, { ok: true });
    const ip = req.socket.remoteAddress,
      now = Date.now(),
      rate = attempts.get(ip) || { start: now, count: 0 };
    if (now - rate.start > 60000) {
      rate.start = now;
      rate.count = 0;
    }
    rate.count++;
    attempts.set(ip, rate);
    if (rate.count > 180) throw new HttpError(429, "TROP_DE_TENTATIVES");
    if (path === "/activate" && req.method === "GET")
      return send(
        res,
        200,
        '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Activation FasoConnect</title><h1>Activation locale</h1><p>Saisissez l’identifiant et le code remis par votre administrateur. Le code expire après quinze minutes et ne sert qu’une fois.</p><form method="post"><label>Identifiant <input name="username" required></label><label>Code <input name="code" required type="password"></label><button>Activer</button></form></html>',
        {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        },
      );
    if (path === "/activate" && req.method === "POST") {
      if (req.headers.origin !== origin)
        throw new HttpError(403, "ORIGINE_INVALIDE");
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 1024) throw new HttpError(413, "REQUETE_TROP_LONGUE");
      }
      const form = new URLSearchParams(text),
        username = form.get("username"),
        code = form.get("code") || "";
      if (code.length < 32) throw new HttpError(403, "CODE_INVALIDE_OU_EXPIRE");
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const row = await db.query(
          "UPDATE faso_activations SET used=true WHERE username=$1 AND code_hash=$2 AND expires_at>$3 AND used=false RETURNING username",
          [
            username,
            createHash("sha256").update(code).digest("hex"),
            Date.now(),
          ],
        );
        if (!row.rowCount) throw new HttpError(403, "CODE_INVALIDE_OU_EXPIRE");
        const user = await findUser(username);
        await kc("PUT", "/users/" + user.id, { enabled: true });
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
      return send(
        res,
        200,
        "Compte activé. Ouvrez https://" +
          process.env.DOMAIN +
          "/service/ et changez le mot de passe temporaire, puis configurez le TOTP.",
      );
    }
    if (path === "/admin/login") {
      const state = oidc.randomState(),
        verifier = oidc.randomPKCECodeVerifier(),
        nonce = oidc.randomNonce();
      pending.set(state, { verifier, nonce, expires: Date.now() + 300000 });
      const target = oidc.buildAuthorizationUrl(config, {
        redirect_uri: origin + "/admin/callback",
        scope: "openid profile roles",
        state,
        nonce,
        max_age: "0",
        prompt: "login",
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
      });
      return send(res, 302, "", {
        Location: target.href,
        "Set-Cookie":
          "faso_oauth=" +
          state +
          "; Secure; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=300",
      });
    }
    if (path === "/admin/callback") {
      const state = url.searchParams.get("state"),
        p = pending.get(state);
      pending.delete(state);
      const cookie = req.headers.cookie
        ?.split("; ")
        .find((v) => v.startsWith("faso_oauth="))
        ?.slice(11);
      if (!p || p.expires < Date.now() || cookie !== state)
        throw new HttpError(400, "ETAT_OIDC_INVALIDE");
      const tokens = await oidc.authorizationCodeGrant(config, url, {
        pkceCodeVerifier: p.verifier,
        expectedState: state,
        expectedNonce: p.nonce,
      });
      const { payload } = await jwtVerify(tokens.access_token, jwks, {
        issuer,
        audience: "faso-admin-api",
        algorithms: ["RS256"],
      });
      if (!payload.realm_access?.roles.includes("administrateur"))
        throw new HttpError(403, "ROLE_ADMINISTRATEUR_REQUIS");
      const subject = tokens.claims()?.sub;
      if (typeof subject !== "string")
        throw new HttpError(401, "SUJET_OIDC_ABSENT");
      const id = randomBytes(32).toString("hex");
      sessions.set(id, {
        sub: subject,
        username: payload.preferred_username,
        csrf: randomBytes(32).toString("hex"),
        authAt: Date.now(),
        expires: Date.now() + 600000,
      });
      return send(res, 302, "", {
        Location: "/admin/",
        "Set-Cookie":
          "faso_admin=" +
          id +
          "; Secure; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=600",
      });
    }
    if (
      path === "/admin/" ||
      path === "/admin/app.js" ||
      path === "/admin/style.css"
    ) {
      const name = path === "/admin/" ? "index.html" : path.split("/").pop();
      return send(
        res,
        200,
        await readFile(new URL("./public/" + name, import.meta.url), "utf8"),
        {
          "Content-Type": name.endsWith(".js")
            ? "text/javascript"
            : name.endsWith(".css")
              ? "text/css"
              : "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        },
      );
    }
    if (path.startsWith("/assistant/api/")) {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new HttpError(401, "CONNEXION_REQUISE");
      const authorize = async (room) => {
        const who = await matrix(
          "GET",
          "/_matrix/client/v3/account/whoami",
          undefined,
          token,
        );
        const username = who.user_id?.split(":")[0]?.slice(1);
        if (!username) throw new HttpError(401, "SESSION_INVALIDE");
        const account = await findUser(username);
        if (!account.enabled) throw new HttpError(401, "COMPTE_REVOQUE");
        const roles = await pool.query(
          "SELECT role FROM faso_agent_roles WHERE user_id=$1",
          [who.user_id],
        );
        const role = roles.rows[0]?.role;
        if (!["agent", "responsable", "administrateur"].includes(role))
          throw new HttpError(403, "AGENT_NON_ENROLE");
        if (room) {
          const frozen = await pool.query(
            "SELECT 1 FROM faso_frozen_rooms WHERE room_id=$1",
            [room],
          );
          if (frozen.rows.length)
            throw new HttpError(403, "Utilisez la conversation renouvelée.");
          const membership = await matrix(
            "GET",
            "/_matrix/client/v3/rooms/" +
              enc(room) +
              "/state/m.room.member/" +
              enc(who.user_id),
            undefined,
            token,
          );
          if (membership.membership !== "join")
            throw new HttpError(403, "CONVERSATION_NON_REJOINTE");
        }
        return {
          userId: who.user_id,
          role,
          name: account.firstName || username,
        };
      };
      const identity = await authorize();
      if (path === "/assistant/api/status" && req.method === "GET")
        return send(res, 200, {
          ...(await assistant.status()),
          profile: { role: identity.role, name: identity.name },
        });
      if (path === "/assistant/api/run" && req.method === "POST") {
        if (
          req.headers.origin !== origin ||
          !req.headers["content-type"]?.startsWith("application/json")
        )
          throw new HttpError(403, "ORIGINE_INVALIDE");
        const request = validateRequest(await body(req, 7 * 1024 * 1024));
        await authorize(request.roomId);
        const abort = new AbortController();
        const cancel = () => abort.abort();
        res.on("close", cancel);
        try {
          return send(
            res,
            200,
            await assistant.run(
              identity.userId,
              { ...request, profile: { role: identity.role } },
              abort.signal,
              async () => {
                const current = await authorize(request.roomId);
                if (current.role !== identity.role)
                  throw new HttpError(403, "PROFIL_MODIFIE");
              },
            ),
          );
        } finally {
          res.off("close", cancel);
        }
      }
      throw new HttpError(404, "INTROUVABLE");
    }
    if (path === "/directory") {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (!token) throw new HttpError(401, "CONNEXION_REQUISE");
      await matrix(
        "GET",
        "/_matrix/client/v3/account/whoami",
        undefined,
        token,
      );
      const list = await kc("GET", "/users?max=200");
      const roles = Object.fromEntries(
        (
          await pool.query("SELECT user_id,role FROM faso_agent_roles")
        ).rows.map((r) => [r.user_id, r.role]),
      );
      const directory = Object.fromEntries(
        (await pool.query("SELECT * FROM faso_directory")).rows.map((r) => [
          r.user_id,
          r,
        ]),
      );
      return send(
        res,
        200,
        list
          .filter((u) => u.enabled && !u.username.startsWith("service-account"))
          .map((u) => {
            const id = "@" + u.username + ":" + process.env.DOMAIN,
              d = directory[id];
            return {
              id: u.username,
              role: roles[id],
              name:
                d?.name || [u.firstName, u.lastName].filter(Boolean).join(" "),
              ministere: d?.ministere || "",
              direction: d?.direction || "",
              fonction: d?.fonction || "",
            };
          }),
      );
    }
    if (path === "/room-successors") {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (!token) throw new HttpError(401, "CONNEXION_REQUISE");
      const who = await matrix(
        "GET",
        "/_matrix/client/v3/account/whoami",
        undefined,
        token,
      );
      const operations = (await pool.query("SELECT data FROM faso_revocations"))
        .rows;
      return send(
        res,
        200,
        operations.flatMap(({ data }) =>
          (data.rooms || [])
            .filter((r) => r.next && r.members?.includes(who.user_id))
            .map((r) => ({ old: r.old, next: r.next })),
        ),
      );
    }
    if (!path.startsWith("/admin/api/"))
      throw new HttpError(404, "INTROUVABLE");
    const s = await session(
      req,
      req.method === "POST" && path !== "/admin/api/logout",
    );
    if (path === "/admin/api/logout" && req.method === "POST") {
      sessions.delete(sid(req));
      return send(
        res,
        200,
        { ok: true },
        {
          "Set-Cookie":
            "faso_admin=; Secure; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=0",
        },
      );
    }
    if (path === "/admin/api/session")
      return send(res, 200, {
        username: s.username,
        csrf: s.csrf,
        fresh: Date.now() - s.authAt < 120000,
      });
    if (path === "/admin/api/devices" && req.method === "GET") {
      const username = url.searchParams.get("username");
      if (!/^[a-z][a-z0-9._-]{2,50}$/.test(username || ""))
        throw new HttpError(400, "IDENTIFIANT_INVALIDE");
      const result = await matrix(
        "GET",
        "/_synapse/admin/v2/users/" +
          enc("@" + username + ":" + process.env.DOMAIN) +
          "/devices",
      );
      return send(
        res,
        200,
        result.devices.map((d) => ({
          id: d.device_id,
          name: d.display_name || "",
          lastSeen: d.last_seen_ts || null,
        })),
      );
    }
    if (path === "/admin/api/agents" && req.method === "GET") {
      const list = await kc("GET", "/users?max=200");
      const directory = Object.fromEntries(
        (await pool.query("SELECT * FROM faso_directory")).rows.map((r) => [
          r.user_id,
          r,
        ]),
      );
      return send(
        res,
        200,
        list
          .filter((u) => !u.username.startsWith("service-account"))
          .map((u) => ({
            username: u.username,
            enabled: u.enabled,
            name: [u.firstName, u.lastName].filter(Boolean).join(" "),
            ...directory["@" + u.username + ":" + process.env.DOMAIN],
          })),
      );
    }
    if (path === "/admin/api/revocations" && req.method === "GET")
      return send(
        res,
        200,
        (
          await pool.query(
            "SELECT data FROM faso_revocations ORDER BY (data->>'startedAt')::bigint DESC LIMIT 50",
          )
        ).rows.map((r) => r.data),
      );
    if (path === "/admin/api/revoke" && req.method === "POST") {
      const b = await body(req);
      if (
        !/^[a-z][a-z0-9._-]{2,50}$/.test(b.username) ||
        b.username === s.username ||
        b.username === "faso-operator"
      )
        throw new HttpError(400, "IDENTIFIANT_INVALIDE");
      if (b.device && !/^[A-Za-z0-9._-]{1,64}$/.test(b.device))
        throw new HttpError(400, "APPAREIL_INVALIDE");
      await findUser(b.username);
      const op = {
        id: randomUUID(),
        username: b.username,
        user: "@" + b.username + ":" + process.env.DOMAIN,
        device: b.device || null,
        status: "running",
        startedAt: Date.now(),
        actor: s.username,
      };
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await db.query("SELECT pg_advisory_xact_lock(226)");
        if (
          (
            await db.query(
              "SELECT 1 FROM faso_revocations WHERE data->>'status' <> 'effective' LIMIT 1",
            )
          ).rows.length
        )
          throw new HttpError(409, "RESOUDRE_OPERATION_EN_COURS");
        await db.query("INSERT INTO faso_revocations(id,data) VALUES($1,$2)", [
          op.id,
          op,
        ]);
        await db.query(
          "INSERT INTO faso_audit(actor,action,target) VALUES($1,$2,$3)",
          [s.username, b.device ? "revoke_device" : "revoke_agent", b.username],
        );
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      } finally {
        db.release();
      }
      s.authAt = 0;
      startOperation(op);
      return send(res, 202, op);
    }
    if (path === "/admin/api/retry" && req.method === "POST") {
      const b = await body(req),
        r = await pool.query("SELECT data FROM faso_revocations WHERE id=$1", [
          b.id,
        ]);
      if (!r.rows.length) throw new HttpError(404, "INTROUVABLE");
      const op = r.rows[0].data;
      if (op.status === "effective") throw new HttpError(409, "DEJA_EFFECTIVE");
      s.authAt = 0;
      startOperation(op);
      return send(res, 202, op);
    }
    if (path === "/admin/api/enroll" && req.method === "POST") {
      const b = await body(req);
      if (
        !/^[a-z][a-z0-9._-]{2,50}$/.test(b.username) ||
        !["agent", "responsable"].includes(b.role) ||
        typeof b.name !== "string" ||
        b.name.length > 80
      )
        throw new HttpError(400, "DONNEES_INVALIDES");
      const password = randomBytes(24).toString("base64url");
      await kc("POST", "/users", {
        username: b.username,
        enabled: false,
        firstName: b.name,
        lastName: "Simulation",
        email: b.username + "@example.invalid",
        requiredActions: ["UPDATE_PASSWORD", "CONFIGURE_TOTP"],
        credentials: [{ type: "password", value: password, temporary: true }],
      });
      const user = await findUser(b.username); // Application roles live in PostgreSQL; no realm-wide role delegation is needed.
      await pool.query(
        "INSERT INTO faso_agent_roles(user_id,role) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role",
        ["@" + b.username + ":" + process.env.DOMAIN, b.role],
      );
      await pool.query(
        "INSERT INTO faso_directory(user_id,name,ministere,direction,fonction) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO NOTHING",
        [
          "@" + b.username + ":" + process.env.DOMAIN,
          b.name,
          "Ministère fictif de la Simulation",
          "Direction fictive",
          b.role,
        ],
      );
      const activationCode = randomBytes(32).toString("base64url"),
        expiresAt = Date.now() + 900000;
      await pool.query(
        "INSERT INTO faso_activations(username,code_hash,expires_at,used) VALUES($1,$2,$3,false)",
        [
          b.username,
          createHash("sha256").update(activationCode).digest("hex"),
          expiresAt,
        ],
      );
      s.authAt = 0;
      return send(res, 201, {
        username: b.username,
        temporaryPassword: password,
        activationCode,
        expiresAt,
        activation:
          "Remise locale : saisir le code sur /activate sous quinze minutes, puis changer le mot de passe et configurer TOTP.",
      });
    }
    if (path === "/admin/api/directory" && req.method === "POST") {
      const b = await body(req);
      if (
        !/^[a-z][a-z0-9._-]{2,50}$/.test(b.username) ||
        !["name", "ministere", "direction", "fonction"].every(
          (k) => typeof b[k] === "string" && b[k].length <= 120,
        ) ||
        !b.name.trim()
      )
        throw new HttpError(400, "DONNEES_INVALIDES");
      await findUser(b.username);
      await pool.query(
        "INSERT INTO faso_directory(user_id,name,ministere,direction,fonction) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,ministere=excluded.ministere,direction=excluded.direction,fonction=excluded.fonction",
        [
          "@" + b.username + ":" + process.env.DOMAIN,
          b.name,
          b.ministere,
          b.direction,
          b.fonction,
        ],
      );
      await pool.query(
        "INSERT INTO faso_audit(actor,action,target) VALUES($1,$2,$3)",
        [s.username, "directory_update", b.username],
      );
      s.authAt = 0;
      return send(res, 200, { ok: true });
    }
    if (path === "/admin/api/reauthorize" && req.method === "POST") {
      const b = await body(req);
      if (
        !/^[a-z][a-z0-9._-]{2,50}$/.test(b.username) ||
        b.username === s.username ||
        b.username === "faso-operator"
      )
        throw new HttpError(400, "IDENTIFIANT_INVALIDE");
      const user = await findUser(b.username);
      if (user.enabled) throw new HttpError(409, "COMPTE_DEJA_ACTIF");
      if (
        (
          await pool.query(
            "SELECT 1 FROM faso_revocations WHERE data->>'username'=$1 AND data->>'status'<>'effective'",
            [b.username],
          )
        ).rows.length
      )
        throw new HttpError(409, "REVOCATION_INCOMPLETE");
      await matrix(
        "PUT",
        "/_synapse/admin/v2/users/" +
          enc("@" + b.username + ":" + process.env.DOMAIN),
        { deactivated: false },
      );
      const password = randomBytes(24).toString("base64url");
      await kc("PUT", "/users/" + user.id + "/reset-password", {
        type: "password",
        value: password,
        temporary: true,
      });
      const credentials = await kc("GET", "/users/" + user.id + "/credentials");
      for (const credential of credentials.filter((c) => c.type === "otp"))
        await kc(
          "DELETE",
          "/users/" + user.id + "/credentials/" + credential.id,
        );
      await kc("PUT", "/users/" + user.id, {
        enabled: true,
        requiredActions: ["UPDATE_PASSWORD", "CONFIGURE_TOTP"],
      });
      await pool.query(
        "INSERT INTO faso_audit(actor,action,target) VALUES($1,$2,$3)",
        [s.username, "reauthorize", b.username],
      );
      s.authAt = 0;
      return send(res, 200, {
        username: b.username,
        temporaryPassword: password,
        activation:
          "Nouvelle activation locale et TOTP requis. Les anciennes sessions restent invalides ; nouvelles invitations nécessaires.",
      });
    }
    throw new HttpError(404, "INTROUVABLE");
  } catch (error) {
    send(res, error.status || 500, {
      error: error.status ? error.message : "ERREUR_INTERNE",
    });
  }
});
setInterval(() => {
  for (const [id, s] of sessions)
    if (s.expires < Date.now()) sessions.delete(id);
  for (const [id, p] of pending) if (p.expires < Date.now()) pending.delete(id);
}, 60000).unref();
server.listen(3000, "0.0.0.0");
for (const row of (
  await pool.query(
    "SELECT data FROM faso_revocations WHERE data->>'status'='running'",
  )
).rows) {
  const op = row.data;
  op.status = "partial";
  op.error = "SERVICE_RESTARTED";
  await store.save(op);
}
const retention = Math.max(
  1,
  Math.min(365, Number(process.env.AUDIT_RETENTION_DAYS) || 30),
);
setInterval(() => {
  pool
    .query(
      "DELETE FROM faso_audit WHERE created_at < now() - ($1 * interval '1 day')",
      [retention],
    )
    .catch(() => {});
}, 3600000).unref();
