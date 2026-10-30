import loglevel from "loglevel";
import "./style.css";
import { openAssistant } from "./assistant";
import { installUpdates } from "./updates";
import { collectAssistantContext } from "./assistant-context.js";
import {
  validateInstruction,
  validateAcknowledgement,
} from "./instructions.js";
import * as sdk from "matrix-js-sdk";
import {
  encryptAttachment,
  decryptAttachment,
} from "matrix-encrypt-attachment";

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
const root = document.getElementById("app")!;
root.innerHTML = `<header><a class="brand" href="/service/" aria-label="FasoConnect, accueil"><span class="brand-mark">f.</span><strong>FasoConnect<span class="brand-dot">.</span></strong></a><span class="header-caption">Un espace de confiance.</span><span class="security-badge">Échanges protégés</span></header><div id="status" role="status">Votre espace de messagerie sécurisé</div><div id="content"></div>`;
const $ = (id: string) => document.getElementById(id)!;
const humanError = (e: any) =>
  e.httpStatus === 401
    ? "La session est terminée. Reconnectez-vous."
    : e.httpStatus === 403
      ? "Action refusée. Vérifiez vos droits ou ouvrez la conversation renouvelée."
      : e.httpStatus === 429
        ? "Trop de tentatives. Réessayez dans quelques instants."
        : e.message || "Opération impossible";
const status = (text: string) => ($("status").textContent = text);
const node = (tag: string, text?: string, cls?: string) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
let client: any,
  roomId: string,
  agents: any[] = [],
  busy = false,
  reply: any,
  lockRelease: any,
  query = "";
let successors: any[] = [];
const controls = new Set<HTMLButtonElement>();
function button(text: string, action: () => any, cls = "") {
  const b = node("button", text, cls) as HTMLButtonElement;
  b.onclick = async () => {
    if (b.disabled) return;
    b.disabled = true;
    try {
      await action();
    } catch (e: any) {
      status(humanError(e));
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
function panel(title: string) {
  closePanel();
  const p = node("div", undefined, "panel");
  p.setAttribute("role", "dialog");
  p.setAttribute("aria-label", title);
  p.append(button("Fermer", closePanel, "panel-close"), node("h2", title));
  document.body.append(p);
  return p;
}
function closePanel() {
  const p = document.querySelector(".panel");
  p?.dispatchEvent(new Event("faso-close"));
  p?.remove();
}
function showAssistant() {
  const id = roomId,
    room = client.getRoom(id),
    context = collectAssistantContext(
      room?.getLiveTimeline().getEvents() || [],
      (event) => validInstruction(event, room),
    );
  return openAssistant({
    token: client.getAccessToken(),
    roomId: id,
    context,
    panel,
    locked: () =>
      !client?.getAccessToken() ||
      roomId !== id ||
      (id && client.getRoom(id)?.getMyMembership() !== "join") ||
      successors.some((s) => s.old === id),
    insertDraft: (answer) => {
      const draft = document.getElementById(
        "message-draft",
      ) as HTMLTextAreaElement;
      if (!draft) throw new Error("Ouvrez une conversation.");
      if (
        draft.value.trim() &&
        !confirm("Remplacer votre brouillon actuel par cette proposition ?")
      )
        return;
      draft.value = answer;
      draft.focus();
    },
  });
}
function linkLogin() {
  location.href =
    "/_matrix/client/v3/login/sso/redirect/oidc-keycloak?" +
    new URLSearchParams({ redirectUrl: location.origin + "/service/" });
}
async function directory() {
  const r = await fetch("/directory", {
    headers: { Authorization: "Bearer " + client.getAccessToken() },
  });
  if (!r.ok) throw new Error("Annuaire indisponible");
  agents = await r.json();
  return agents;
}
function role(user: string) {
  return agents.find((a) => "@" + a.id + ":" + location.hostname === user)
    ?.role;
}
async function failLocked() {
  closePanel();
  sessionStorage.removeItem("faso_session");
  client?.stopClient();
  controls.forEach((b) => (b.disabled = true));
  $("content").replaceChildren(
    node("h1", "Session terminée ou révoquée"),
    button("Se reconnecter", linkLogin),
  );
  status(
    "Accès interrompu. Les données déjà reçues peuvent rester dans le stockage cryptographique du navigateur.",
  );
}
async function poll() {
  if (!client) return;
  try {
    await client.whoami();
    await directory();
    const r = await fetch("/room-successors", {
      headers: { Authorization: "Bearer " + client.getAccessToken() },
    });
    if (r.ok) {
      const previous = successors.find((x) => x.old === roomId)?.next;
      successors = await r.json();
      if (
        roomId &&
        successors.find((x) => x.old === roomId)?.next !== previous
      ) {
        reply = null;
        await openRoom(roomId);
        status(
          "Conversation renouvelée. Le brouillon de l’ancien salon a été effacé sans envoi.",
        );
      }
    }
  } catch (e: any) {
    if (e.httpStatus === 401) await failLocked();
  }
}
function displayName(user: string) {
  return (
    agents.find((a) => "@" + a.id + ":" + location.hostname === user)?.name ||
    user?.split(":")[0].replace(/^@/, "") ||
    "Collègue"
  );
}
function rooms() {
  const list = $("rooms"),
    profile = node("div", undefined, "profile-card");
  const spaceOpen = list.querySelector("details")?.open || false;
  profile.append(
    node(
      "span",
      displayName(client.getUserId()).slice(0, 1).toUpperCase(),
      "avatar",
    ),
    node("div", displayName(client.getUserId()), "profile-name"),
  );
  list.replaceChildren(
    profile,
    button("+ Nouvelle conversation", createRoom, "primary new-conversation"),
    node("h2", "Conversations"),
  );
  const conversations = node("div", undefined, "conversation-list");
  for (const room of client.getRooms()) {
    if (room.getMyMembership() === "invite") {
      conversations.append(
        button("Invitation · " + room.name, async () => {
          await client.joinRoom(room.roomId);
          await openRoom(room.roomId);
          rooms();
        }),
        button("Refuser cette invitation", async () => {
          await client.leave(room.roomId);
          rooms();
        }),
      );
      continue;
    }
    if (room.getMyMembership() !== "join") continue;
    const b = button(
      room.name || "Conversation privée",
      () => openRoom(room.roomId),
      room.roomId === roomId ? "conversation selected" : "conversation",
    );
    b.prepend(
      node("span", (room.name || "C").slice(0, 1).toUpperCase(), "room-avatar"),
    );
    conversations.append(b);
  }
  if (!conversations.childElementCount)
    conversations.append(
      node("p", "Votre prochaine conversation commence ici.", "sidebar-empty"),
    );
  const tools = node("nav", undefined, "sidebar-tools");
  tools.setAttribute("aria-label", "Outils de messagerie");
  tools.append(
    button("✦ Assistant IA", showAssistant, "assistant-entry"),
    button("Annuaire", showDirectory),
  );
  const more = node("details", undefined, "more-tools");
  (more as HTMLDetailsElement).open = spaceOpen;
  more.append(
    node("summary", "Mon espace"),
    button("Appareils et clés", showDevices),
    button("Installer l’application", installHelp),
    button("Déconnexion", async () => {
      await client.logout();
      await failLocked();
    }),
  );
  if (role(client.getUserId()) === "administrateur")
    more.append(
      button("Administration", () => {
        location.href = "/admin/";
      }),
    );
  tools.append(more);
  list.append(conversations, tools);
}
function showDirectory() {
  const p = panel("Retrouvez vos collègues"),
    search = node("input") as HTMLInputElement;
  search.placeholder = "Nom, ministère, direction…";
  search.setAttribute("aria-label", "Rechercher dans l’annuaire");
  const list = node("div");
  p.append(search, list);
  const render = () => {
    list.replaceChildren();
    for (const a of agents.filter((a) =>
      JSON.stringify(a).toLowerCase().includes(search.value.toLowerCase()),
    )) {
      const row = node(
        "div",
        a.name +
          " · " +
          a.id +
          "\n" +
          a.ministere +
          " / " +
          a.direction +
          " · " +
          (a.fonction || a.role || "Agent"),
        "directory",
      );
      list.append(row);
    }
  };
  search.oninput = render;
  render();
}
function showMembers() {
  const room = client.getRoom(roomId),
    p = panel("Membres");
  const canManage =
    ["responsable", "administrateur"].includes(role(client.getUserId())) &&
    (room.currentState.getMember(client.getUserId())?.powerLevel || 0) >= 50;
  for (const member of room.getMembers()) {
    const row = node("div", undefined, "directory");
    row.append(node("p", member.userId + " · " + member.membership));
    if (
      canManage &&
      member.userId !== client.getUserId() &&
      ["join", "invite"].includes(member.membership)
    )
      row.append(
        button("Retirer du groupe", async () => {
          await client.kick(
            roomId,
            member.userId,
            "Retrait administratif du groupe",
          );
          p.remove();
        }),
      );
    p.append(row);
  }
  if (canManage) {
    const name = node("input") as HTMLInputElement;
    name.placeholder = "Identifiant de l’agent à inviter";
    name.setAttribute("aria-label", "Identifiant à inviter");
    p.append(
      name,
      button("Inviter", async () => {
        if (!agents.some((a) => a.id === name.value))
          throw new Error("Agent absent de l’annuaire");
        await client.invite(roomId, "@" + name.value + ":" + location.hostname);
        p.remove();
      }),
    );
  }
}
async function createRoom() {
  const p = panel("Nouvelle conversation privée");
  const name = node("input") as HTMLInputElement;
  name.placeholder = "Nom du groupe (visible du serveur)";
  const members = node("input") as HTMLInputElement;
  members.placeholder = "agent.beta, responsable.gamma";
  p.append(
    name,
    members,
    node(
      "small",
      "Uniquement des agents de l’annuaire. Les nouveaux salons sont chiffrés et sur invitation.",
    ),
    button(
      "Créer",
      async () => {
        const ids = members.value
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        if (!ids.length || ids.some((id) => !agents.some((a) => a.id === id)))
          throw new Error(
            "Choisissez des identifiants présents dans l’annuaire.",
          );
        if (
          ids.length > 1 &&
          !["responsable", "administrateur"].includes(role(client.getUserId()))
        )
          throw new Error("Un responsable crée les groupes institutionnels.");
        const result = await client.createRoom({
          preset: "private_chat",
          visibility: "private",
          name: name.value || "Conversation privée",
          invite: ids.map((id) => "@" + id + ":" + location.hostname),
          creation_content: { "m.federate": false },
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
        p.remove();
        await openRoom(result.room_id);
      },
      "primary",
    ),
  );
}
async function verifiedRecipients() {
  const room = client.getRoom(roomId);
  if (!room?.hasEncryptionStateEvent())
    throw new Error("Envoi bloqué : conversation non chiffrée.");
  if (room.currentState.getStateEvents("m.room.tombstone", ""))
    throw new Error("Conversation renouvelée : ouvrez son successeur.");
  const users = room.getJoinedMembers().map((m: any) => m.userId);
  const map = await client.getCrypto().getUserDeviceInfo(users, true);
  for (const [user, devices] of map) {
    for (const [id] of devices) {
      if (user === client.getUserId() && id === client.getDeviceId()) continue;
      const trust = await client
        .getCrypto()
        .getDeviceVerificationStatus(user, id);
      if (!trust?.isVerified())
        throw new Error(
          "Vérifiez les appareils des participants avant l’envoi.",
        );
    }
  }
}
async function send(type: string, content: any) {
  if (!navigator.onLine)
    throw new Error(
      "Hors ligne. Le brouillon reste uniquement dans cette fenêtre.",
    );
  if (busy) throw new Error("Un envoi est déjà en cours.");
  busy = true;
  try {
    await verifiedRecipients();
    await client.sendEvent(roomId, type, content);
    status("Événement chiffré envoyé.");
  } finally {
    busy = false;
  }
}
async function openRoom(id: string) {
  closePanel();
  $("chat").classList.remove("empty-chat");
  roomId = id;
  query = "";
  controls.clear();
  rooms();
  const room = client.getRoom(id);
  if (!room) return;
  const chat = $("chat");
  chat.replaceChildren(
    node("h1", room.name),
    node(
      "div",
      "Conversation privée · Vos messages restent entre vous",
      "meta",
    ),
  );
  const actions = node("div", undefined, "actions");
  actions.append(
    button("Membres", showMembers),
    button("Quitter", async () => {
      await client.leave(roomId);
      roomId = "";
      rooms();
      chat.replaceChildren();
    }),
  );
  if (["responsable", "administrateur"].includes(role(client.getUserId())))
    actions.append(button("Instruction de service", instruction));
  chat.append(actions);
  const tombstone = room.currentState.getStateEvents("m.room.tombstone", "");
  const replacement =
    tombstone?.getContent().replacement_room ||
    successors.find((x) => x.old === id)?.next;
  if (replacement) {
    chat.append(
      node("p", "Ce salon a été bloqué après une révocation."),
      button("Ouvrir la conversation renouvelée", async () => {
        await client.joinRoom(replacement);
        await openRoom(replacement);
      }),
    );
  }
  const search = node("input") as HTMLInputElement;
  search.placeholder = "Rechercher dans les messages déchiffrés ici";
  search.setAttribute("aria-label", "Recherche locale dans la conversation");
  search.oninput = () => {
    query = search.value.toLowerCase();
    renderMessages();
  };
  chat.append(
    search,
    button("Charger l’historique précédent", async () => {
      await client.scrollback(room, 50);
      renderMessages();
    }),
  );
  const messages = node("div", undefined, "messages");
  messages.id = "messages";
  chat.append(messages);
  const compose = node("form", undefined, "composer") as HTMLFormElement;
  const input = node("textarea") as HTMLTextAreaElement;
  input.id = "message-draft";
  input.placeholder = "Votre message…";
  input.setAttribute("aria-label", "Message");
  const submit = node("button", "Envoyer", "primary") as HTMLButtonElement;
  submit.type = "submit";
  controls.add(submit);
  compose.append(input, submit);
  compose.onsubmit = async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    submit.disabled = true;
    try {
      const body: any = { msgtype: "m.text", body: input.value };
      if (reply)
        body["m.relates_to"] = { "m.in_reply_to": { event_id: reply } };
      await send("m.room.message", body);
      input.value = "";
      reply = null;
    } catch (e: any) {
      status(humanError(e));
    } finally {
      submit.disabled = false;
    }
  };
  const file = node("input") as HTMLInputElement;
  file.type = "file";
  file.id = "attachment-input";
  file.className = "visually-hidden";
  file.setAttribute("aria-label", "Joindre un fichier de 10 Mo maximum");
  file.onchange = async () => {
    try {
      const selected = file.files?.[0];
      if (!selected) return;
      if (selected.size > 10 * 1024 * 1024)
        throw new Error("Fichier limité à 10 Mo.");
      await verifiedRecipients();
      const encrypted = await encryptAttachment(await selected.arrayBuffer());
      const uploaded = await client.uploadContent(new Blob([encrypted.data]), {
        type: "application/octet-stream",
        includeFilename: false,
      });
      await send("m.room.message", {
        msgtype: "m.file",
        body: selected.name,
        info: { mimetype: selected.type, size: selected.size },
        file: { ...encrypted.info, url: uploaded.content_uri },
      });
    } catch (e: any) {
      status(humanError(e));
    } finally {
      file.value = "";
    }
  };
  const attach = node(
    "label",
    "Joindre un fichier",
    "attachment-button",
  ) as HTMLLabelElement;
  attach.htmlFor = "attachment-input";
  chat.append(compose, attach, file);
  renderMessages();
}
function validInstruction(event: any, room: any) {
  return (
    event.getType() === "bf.fasoconnect.instruction" &&
    validateInstruction(
      {
        roomId: event.getRoomId(),
        sender: event.getSender(),
        content: event.getContent(),
      },
      {
        roomId: roomId,
        members: room.getJoinedMembers().map((m: any) => m.userId),
        role: role(event.getSender()),
        power: room.currentState.getMember(event.getSender())?.powerLevel || 0,
      },
    )
  );
}
function renderMessages() {
  const box = $("messages");
  if (!box || !roomId) return;
  const room = client.getRoom(roomId),
    events = room?.getLiveTimeline().getEvents() || [];
  box.replaceChildren();
  for (const event of events) {
    if (event.isState()) continue;
    const c = event.getContent();
    if (event.getType() === "bf.fasoconnect.ack") continue;
    if (
      query &&
      !((c.body || "") + " " + (c.subject || "")).toLowerCase().includes(query)
    )
      continue;
    const b = node("article", undefined, "bubble");
    b.append(
      node(
        "div",
        displayName(event.getSender()) +
          " · " +
          new Date(event.getTs()).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        "sender",
      ),
    );
    if (event.isDecryptionFailure()) {
      b.append(
        node(
          "p",
          "Impossible de déchiffrer : clés manquantes ou appareil non vérifié.",
        ),
      );
    } else if (validInstruction(event, room)) {
      b.classList.add("instruction");
      b.append(
        node("strong", c.subject),
        node("p", c.body),
        node(
          "div",
          "Priorité : " +
            c.priority +
            (c.deadline ? " · Échéance : " + c.deadline : ""),
          "priority",
        ),
      );
      const confirmations = new Set(
        events
          .filter(
            (ack: any) =>
              ack.getType() === "bf.fasoconnect.ack" &&
              validateAcknowledgement(
                {
                  roomId: ack.getRoomId(),
                  sender: ack.getSender(),
                  content: ack.getContent(),
                },
                { roomId: roomId, id: event.getId(), content: c },
              ),
          )
          .map((ack: any) => ack.getSender()),
      );
      b.append(
        node(
          "p",
          "Confirmations : " + confirmations.size + " / " + c.recipients.length,
        ),
      );
      if (
        c.recipients.includes(client.getUserId()) &&
        !confirmations.has(client.getUserId())
      )
        b.append(
          button("J’ai pris connaissance", () =>
            send("bf.fasoconnect.ack", {
              instruction_id: event.getId(),
              acknowledged: true,
            }),
          ),
        );
    } else if (event.getType() === "bf.fasoconnect.instruction") {
      b.append(
        node("p", "Instruction rejetée : auteur, rôle ou contenu incohérent."),
      );
    } else if (event.getType() === "m.room.message") {
      if (c["m.relates_to"]?.["m.in_reply_to"])
        b.append(node("div", "Réponse à un message", "reply"));
      b.append(node("div", c.body || "Message"));
      if (c.file)
        b.append(button("Télécharger et déchiffrer", () => download(c)));
      b.append(
        button("Répondre", () => {
          reply = event.getId();
          status("Réponse sélectionnée. Rédigez votre message.");
        }),
      );
    } else continue;
    box.append(b);
  }
  box.scrollTop = box.scrollHeight;
}
async function download(c: any) {
  const match = /^mxc:\/\/([^/]+)\/(.+)$/.exec(c.file.url);
  if (!match) throw new Error("Référence média invalide");
  const r = await fetch(
    "/_matrix/client/v1/media/download/" +
      encodeURIComponent(match[1]) +
      "/" +
      encodeURIComponent(match[2]),
    { headers: { Authorization: "Bearer " + client.getAccessToken() } },
  );
  if (!r.ok) throw new Error("Téléchargement refusé");
  const bytes = await decryptAttachment(await r.arrayBuffer(), c.file);
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/octet-stream" }),
  );
  const a = node("a") as HTMLAnchorElement;
  a.href = url;
  a.download = c.body || "fichier";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function instruction() {
  if (!["responsable", "administrateur"].includes(role(client.getUserId())))
    throw new Error("Un responsable publie les instructions.");
  const p = panel("Instruction de service"),
    subject = node("input") as HTMLInputElement,
    body = node("textarea") as HTMLTextAreaElement,
    priority = node("select") as HTMLSelectElement,
    deadline = node("input") as HTMLInputElement;
  subject.placeholder = "Objet";
  body.placeholder = "Contenu de l’instruction";
  deadline.type = "datetime-local";
  for (const value of ["normale", "haute", "urgente"]) {
    const o = node("option", value) as HTMLOptionElement;
    o.value = value;
    priority.append(o);
  }
  p.append(
    subject,
    body,
    priority,
    deadline,
    button(
      "Publier chiffré",
      async () => {
        if (!subject.value.trim() || !body.value.trim())
          throw new Error("Objet et contenu requis");
        const recipients = client
          .getRoom(roomId)
          .getJoinedMembers()
          .map((m: any) => m.userId)
          .filter((id: string) => id !== client.getUserId());
        await send("bf.fasoconnect.instruction", {
          subject: subject.value,
          body: body.value,
          priority: priority.value,
          deadline: deadline.value || null,
          recipients,
        });
        p.remove();
      },
      "primary",
    ),
    node(
      "small",
      "Suivi opérationnel ; cet accusé ne constitue pas une preuve juridique de lecture.",
    ),
  );
}
async function showDevices() {
  const p = panel("Vérification manuelle des appareils");
  p.append(
    node(
      "p",
      "Comparez la clé Ed25519 affichée avec celle que votre correspondant lit sur son appareil, par un canal indépendant. Ne confirmez jamais sans comparaison.",
    ),
  );
  const users = roomId
    ? client
        .getRoom(roomId)
        .getJoinedMembers()
        .map((m: any) => m.userId)
    : [client.getUserId()];
  const map = await client.getCrypto().getUserDeviceInfo(users, true);
  for (const [user, devices] of map) {
    for (const [id, info] of devices) {
      p.append(
        node("h3", user + " · " + id),
        node("pre", JSON.stringify(Object.fromEntries(info.keys), null, 2)),
      );
      if (user === client.getUserId() && id === client.getDeviceId()) {
        p.append(node("small", "Cet appareil"));
        continue;
      }
      p.append(
        button("Confirmer la comparaison de cette clé", async () => {
          if (
            !confirm(
              "Avez-vous comparé cette clé sur les deux appareils par un canal indépendant ?",
            )
          )
            return;
          await client.getCrypto().setDeviceVerified(user, id, true);
          status("Clé vérifiée localement pour cet appareil.");
        }),
      );
    }
  }
}
function installHelp() {
  const p = panel("Installer FasoConnect");
  p.append(
    node(
      "p",
      "Dans Chrome ou Edge, utilisez « Installer l’application » dans le menu du navigateur si proposé. Sur iOS, utilisez Partager puis Sur l’écran d’accueil. La confiance du certificat doit être configurée sur chaque appareil ; localhost ne désigne que cet ordinateur.",
    ),
    node(
      "p",
      "Les messages en attente restent en mémoire dans cette fenêtre. Le stockage IndexedDB du SDK conserve les clés cryptographiques sur cet appareil. Verrouillez votre session Windows. Aucun effacement distant garanti.",
    ),
  );
}
function welcome() {
  $("content").innerHTML =
    `<main class="welcome-layout"><section class="welcome-story"><div class="eyebrow">VOTRE ESPACE DE TRAVAIL</div><h1>Les bons échanges.<br><em>En toute confiance.</em></h1><p>Vos collègues, vos conversations et vos idées.<br>Réunis dans un espace simple et protégé.</p><div class="welcome-tags"><span>Messages privés</span><span>Équipe connectée</span><span>IA locale</span></div><div class="conversation-art" aria-hidden="true"><div class="art-top"><span class="art-avatar">A</span><div><b>Votre équipe</b><small>Une conversation qui avance.</small></div><span class="art-dot"></span></div><div class="art-message">Bonjour ! Le document est prêt pour notre réunion.</div><div class="art-message art-own">Parfait, merci. À tout à l’heure !<span>✓✓</span></div><div class="art-footer"><span>✦</span> Un peu d’aide, beaucoup de simplicité.</div></div><small class="welcome-signature">FasoConnect · Pensé pour vos échanges de service.</small></section><section class="login-card"><div class="eyebrow">HEUREUX DE VOUS RETROUVER</div><h2>Bienvenue chez vous.</h2><p>Connectez-vous pour retrouver votre équipe.</p><div id="welcome-action"></div><div class="login-steps"><span><b>1</b> Votre identifiant et votre mot de passe</span><span><b>2</b> Le code à 6 chiffres de votre téléphone</span></div><details class="login-help"><summary>Première connexion ?</summary><p>Votre administrateur vous remet votre accès. Après avoir choisi votre mot de passe, scannez le QR code affiché avec votre application d’authentification. Elle générera vos codes de connexion.</p><p>Un code ne fonctionne pas ? Vérifiez l’heure automatique du téléphone et attendez le code suivant.</p></details><small>Ce navigateur conserve les clés nécessaires à vos échanges. Utilisez votre appareil personnel et verrouillez votre session.</small></section></main>`;
  $("welcome-action").append(
    button(
      "Se connecter →",
      () => {
        sessionStorage.setItem("faso_sensitive_accepted", "yes");
        if (new URLSearchParams(location.search).has("loginToken"))
          return main();
        linkLogin();
      },
      "primary login-cta",
    ),
  );
}
async function main() {
  if (!sessionStorage.getItem("faso_sensitive_accepted")) {
    welcome();
    return;
  }
  if (!navigator.locks)
    throw new Error(
      "Utilisez un navigateur récent permettant le verrouillage sécurisé du stockage local.",
    );
  let granted = false;
  if (navigator.locks) {
    granted = await new Promise<boolean>((ready) => {
      navigator.locks.request(
        "fasoconnect-crypto",
        { ifAvailable: true },
        async (lock) => {
          ready(Boolean(lock));
          if (!lock) return;
          await new Promise((resolve) => (lockRelease = resolve));
        },
      );
    });
    if (!granted)
      throw new Error(
        "Un autre onglet utilise déjà cet appareil. Fermez-le avant de continuer.",
      );
  }
  const params = new URLSearchParams(location.search),
    token = params.get("loginToken");
  if (token) {
    history.replaceState({}, "", "/service/");
    const r = await fetch("/_matrix/client/v3/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "m.login.token",
        token,
        initial_device_display_name: "FasoConnect Service",
      }),
    });
    if (!r.ok) throw new Error("Connexion SSO impossible");
    sessionStorage.setItem("faso_session", JSON.stringify(await r.json()));
  }
  const raw = sessionStorage.getItem("faso_session");
  if (!raw) {
    welcome();
    return;
  }
  const s = JSON.parse(raw);
  client = sdk.createClient({
    logger: quiet,
    baseUrl: location.origin,
    accessToken: s.access_token,
    userId: s.user_id,
    deviceId: s.device_id,
  });
  await client.initRustCrypto({ cryptoDatabasePrefix: "faso-" + s.device_id });
  await directory();
  $("content").innerHTML =
    '<div class="shell"><aside id="rooms" aria-label="Conversations et outils"></aside><main class="chat empty-chat" id="chat"><div class="empty-state"><span class="empty-symbol">f.</span><div class="eyebrow">BIENVENUE DANS VOTRE ESPACE</div><h1>Une bonne journée<br>commence par un échange.</h1><p>Retrouvez vos collègues dans l’annuaire<br>ou ouvrez une conversation à gauche.</p><div id="empty-actions" class="actions"></div><small>Vos échanges sont privés et protégés.</small></div></main></div>';
  $("empty-actions").append(
    button("Nouvelle conversation", createRoom, "primary"),
    button("Demander à l’assistant ✦", showAssistant),
  );
  client.on("sync", (state: string, prev: string, data: any) => {
    status(
      state === "ERROR"
        ? "Connexion interrompue. Reconnexion en cours…"
        : navigator.onLine
          ? "Connecté · Vos échanges sont protégés"
          : "Hors ligne · Aucun envoi en clair conservé sur disque",
    );
    if (data?.error?.httpStatus === 401) failLocked();
    rooms();
  });
  client.on("Room.timeline", (event: any) => {
    if (
      event.getType() === "m.room.tombstone" &&
      event.getRoomId() === roomId
    ) {
      reply = null;
      openRoom(roomId);
    } else renderMessages();
  });
  client.on("Event.decrypted", () => renderMessages());
  await client.startClient({ initialSyncLimit: 100 });
  setInterval(poll, 5000);
  rooms();
}
window.addEventListener("offline", () =>
  status("Hors ligne : le brouillon reste en mémoire, sans envoi automatique."),
);
void installUpdates(() => busy, status);
main().catch((e: any) => status(humanError(e)));
