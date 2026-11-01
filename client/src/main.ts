import loglevel from "loglevel";
import "./style.css";
import "./messenger.css";
import { installUpdates } from "./updates";
import { createSafeSender } from "./safe-sender.js";
import { openVoiceRecorder } from "./voice-recorder";
import {
  DOSSIER_EVENT,
  DOSSIER_NOTE_EVENT,
  validateDossier,
  validateDossierNote,
} from "./dossiers.js";
import {
  selectedInvitees,
  waitForSyncedRoom,
  partitionConversations,
} from "./conversations.js";
import {
  validateInstruction,
  validateAcknowledgement,
} from "./instructions.js";
import {
  WORKFLOW_EVENT,
  WORKFLOW_LABELS,
  instructionProgress,
  allowedTransitions,
} from "./instruction-workflow.js";
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
root.innerHTML = `<header><a class="brand" href="/service/" aria-label="FasoConnect, accueil"><span class="brand-mark">F</span><strong>FasoConnect<span class="brand-dot">.</span></strong></a><span class="header-caption">Messagerie</span><span class="security-badge">Échanges protégés</span></header><div id="status" role="status">Votre espace de messagerie sécurisé</div><div id="content"></div>`;
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
let safeSender: ReturnType<typeof createSafeSender>;
const controls = new Set<HTMLButtonElement>();
// Brouillons en mémoire seulement : aucun contenu administratif en clair sur disque.
const drafts = new Map<string, string>();
function button(text: string, action: () => any, cls = "") {
  const b = node("button", text, cls) as HTMLButtonElement;
  b.onclick = async () => {
    if (b.disabled) return;
    b.disabled = true;
    const scope = b.closest(".panel");
    scope?.querySelector(".panel-error")?.remove();
    try {
      await action();
    } catch (e: any) {
      const message = humanError(e);
      if (scope?.isConnected) {
        const alert = node("p", message, "panel-error");
        alert.setAttribute("role", "alert");
        scope.append(alert);
        alert.scrollIntoView({ block: "nearest" });
      }
      status(message);
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
function updateSendControls() {
  const room = client?.getRoom(roomId);
  const locked =
    !sessionStorage.getItem("faso_session") ||
    !room ||
    room.getMyMembership() !== "join" ||
    archivedRoom(room);
  document
    .querySelectorAll<HTMLButtonElement>("[data-send-action]")
    .forEach((b) => {
      b.disabled = busy || locked;
    });
}
function sendButton(text: string, action: () => any, cls = "") {
  const b = button(text, action, cls);
  b.dataset.sendAction = "true";
  b.disabled = busy;
  return b;
}
function panel(title: string) {
  closePanel();
  const p = node("div", undefined, "panel");
  p.setAttribute("role", "dialog");
  p.setAttribute("aria-modal", "true");
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
  drafts.clear();
  safeSender?.clear();
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
        drafts.delete(roomId);
        safeSender?.clear(roomId);
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
  const name =
    agents.find((a) => "@" + a.id + ":" + location.hostname === user)?.name ||
    user?.split(":")[0].replace(/^@/, "") ||
    "Collègue";
  return name
    .replace(/\s+Simulation$/, "")
    .replace(
      /^(agent|responsable|admin)\./,
      (_, role) => role[0].toUpperCase() + role.slice(1) + " ",
    );
}
function archivedRoom(room: any) {
  return Boolean(
    successors.some((s) => s.old === room.roomId) ||
      room.currentState.getStateEvents("m.room.tombstone", "") ||
      room
        .getMembers()
        .some((m: any) => m.userId.startsWith("@faso-operator:")),
  );
}
function roomTitle(room: any) {
  const peers = room
    .getMembers()
    .filter(
      (m: any) =>
        m.userId !== client.getUserId() &&
        ["join", "invite"].includes(m.membership) &&
        !m.userId.startsWith("@faso-operator:"),
    );
  const title = room.name || "Conversation";
  if (
    /^Conversation(?: privée| renouvelée)?$/.test(title) ||
    title.includes(" Simulation")
  )
    return peers.length
      ? peers.map((m: any) => displayName(m.userId)).join(", ")
      : "Conversation privée";
  return title;
}
function directConversationKey(room: any) {
  const name = room.currentState
    .getStateEvents("m.room.name", "")
    ?.getContent().name;
  if (name && !/^Conversation(?: privée| renouvelée)?$/.test(name)) return null;
  const members = room
    .getMembers()
    .filter((m: any) => ["join", "invite"].includes(m.membership));
  return members.length === 2
    ? members
        .map((m: any) => m.userId)
        .sort()
        .join("|")
    : null;
}
function roomPreview(room: any) {
  const last = [...room.getLiveTimeline().getEvents()]
    .reverse()
    .find(
      (e: any) =>
        !e.isState() &&
        [
          "m.room.message",
          "m.room.encrypted",
          "bf.fasoconnect.instruction",
        ].includes(e.getType()),
    );
  if (!last) return "Commencez la conversation";
  if (last.isDecryptionFailure() || last.getType() === "m.room.encrypted")
    return "Message protégé";
  return last.getContent().msgtype === "m.file"
    ? "Fichier partagé"
    : String(last.getContent().body || "Instruction de service").slice(0, 75);
}
function conversationButton(room: any) {
  const b = button(
    "",
    () => openRoom(room.roomId),
    room.roomId === roomId ? "conversation selected" : "conversation",
  );
  const info = node("span", undefined, "conversation-info");
  info.append(
    node("strong", roomTitle(room)),
    node("small", roomPreview(room)),
  );
  b.append(
    node("span", roomTitle(room).slice(0, 1).toUpperCase(), "room-avatar"),
    info,
  );
  return b;
}
function rooms() {
  const list = $("rooms"),
    spaceOpen = list.querySelector(".more-tools")?.hasAttribute("open"),
    archiveOpen = list.querySelector(".room-archives")?.hasAttribute("open");
  const scroll = list.querySelector(".conversation-list")?.scrollTop || 0;
  const profile = node("div", undefined, "profile-card");
  profile.append(
    node(
      "span",
      displayName(client.getUserId()).slice(0, 1).toUpperCase(),
      "avatar",
    ),
    node("div", displayName(client.getUserId()), "profile-name"),
  );
  const joined = client
    .getRooms()
    .filter((r: any) => r.getMyMembership() === "join")
    .sort(
      (a: any, b: any) =>
        (b.getLastActiveTimestamp() || 0) - (a.getLastActiveTimestamp() || 0),
    );
  const invites = client
    .getRooms()
    .filter((r: any) => r.getMyMembership() === "invite" && !archivedRoom(r));
  list.replaceChildren(
    profile,
    button("+ Nouveau message", () => createRoom(), "primary new-conversation"),
  );
  if (invites.length)
    list.append(
      button(
        "Invitations reçues · " + invites.length,
        () => showInvitations(),
        "invitations-entry",
      ),
    );
  list.append(node("h2", "Messages"));
  const conversations = node("div", undefined, "conversation-list");
  const { active, archived } = partitionConversations(
    joined,
    archivedRoom,
    directConversationKey,
  );
  for (const room of active) conversations.append(conversationButton(room));
  if (!active.length)
    conversations.append(
      node("p", "Choisissez un collègue pour commencer.", "sidebar-empty"),
    );
  if (archived.length) {
    const details = node(
      "details",
      undefined,
      "room-archives",
    ) as HTMLDetailsElement;
    details.open = Boolean(archiveOpen);
    details.append(
      node("summary", "Anciennes conversations · " + archived.length),
    );
    for (const room of archived) details.append(conversationButton(room));
    conversations.append(details);
  }
  const tools = node("nav", undefined, "sidebar-tools");
  tools.setAttribute("aria-label", "Outils de messagerie");
  tools.append(button("Annuaire des collègues", showDirectory));
  const more = node("details", undefined, "more-tools") as HTMLDetailsElement;
  more.open = Boolean(spaceOpen);
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
  conversations.scrollTop = scroll;
}
function showInvitations() {
  const p = panel("Vos invitations");
  const invites = client
    .getRooms()
    .filter((r: any) => r.getMyMembership() === "invite" && !archivedRoom(r));
  if (!invites.length)
    p.append(node("p", "Vous n’avez aucune invitation en attente."));
  for (const room of invites) {
    const card = node("div", undefined, "invitation-card");
    card.append(
      node("h3", roomTitle(room)),
      node("p", "Vous êtes invité à rejoindre cette conversation privée."),
    );
    const actions = node("div", undefined, "actions");
    actions.append(
      button(
        "Accepter l’invitation",
        async () => {
          await client.joinRoom(room.roomId);
          await openRoom(room.roomId);
          rooms();
        },
        "primary",
      ),
      button("Refuser", async () => {
        await client.leave(room.roomId);
        showInvitations();
        rooms();
      }),
    );
    card.append(actions);
    p.append(card);
  }
}
function contactPicker(
  p: HTMLElement,
  onChoose: (ids: string[]) => Promise<any>,
  multiple: boolean,
  exclude: string[] = [],
  chosen: string[] = [],
) {
  const search = node("input") as HTMLInputElement;
  search.placeholder = "Rechercher un collègue…";
  search.setAttribute("aria-label", "Rechercher un collègue");
  const selected = new Set(chosen),
    list = node("div", undefined, "contact-picker"),
    counter = node("p", "", "selection-count");
  const submit = button(
    "Continuer",
    () => onChoose([...selected]),
    "primary picker-submit",
  );
  const refresh = () => {
    counter.textContent = selected.size
      ? selected.size + " collègue(s) sélectionné(s)"
      : "Choisissez " +
        (multiple ? "un ou plusieurs collègues" : "un collègue");
    submit.disabled = !selected.size;
  };
  const render = () => {
    list.replaceChildren();
    for (const a of agents.filter(
      (a) =>
        !exclude.includes(a.id) &&
        a.id !== client.getUserId().split(":")[0].slice(1) &&
        (a.name + " " + a.id + " " + a.direction)
          .toLocaleLowerCase()
          .includes(search.value.toLocaleLowerCase()),
    )) {
      const row = node("label", undefined, "contact-choice"),
        check = node("input") as HTMLInputElement;
      check.type = "checkbox";
      check.checked = selected.has(a.id);
      const info = node("span", undefined, "contact-info");
      info.append(
        node("strong", displayName("@" + a.id + ":" + location.hostname)),
        node("small", a.fonction || a.role || a.id),
      );
      check.onchange = () => {
        if (!multiple) selected.clear();
        if (check.checked) selected.add(a.id);
        else selected.delete(a.id);
        refresh();
        if (!multiple) render();
      };
      row.append(
        node(
          "span",
          displayName("@" + a.id + ":" + location.hostname)
            .slice(0, 1)
            .toUpperCase(),
          "room-avatar",
        ),
        info,
        check,
      );
      list.append(row);
    }
    if (!list.childElementCount)
      list.append(node("p", "Aucun collègue ne correspond à votre recherche."));
  };
  search.oninput = render;
  p.append(search, list, counter, submit);
  render();
  refresh();
  return submit;
}
function showDirectory() {
  const p = panel("Votre annuaire");
  p.append(
    node(
      "p",
      "Choisissez un collègue pour lui écrire. Son invitation sera envoyée automatiquement si la conversation n’existe pas encore.",
    ),
  );
  contactPicker(p, async (ids) => startConversation(ids), false);
}
function canInvite(room: any) {
  return (
    !archivedRoom(room) &&
    (room.currentState.getMember(client.getUserId())?.powerLevel || 0) >=
      (room.currentState.getStateEvents("m.room.power_levels", "")?.getContent()
        .invite ?? 0)
  );
}
function showInvite() {
  const room = client.getRoom(roomId),
    p = panel("Inviter un collègue");
  if (!room || !canInvite(room)) {
    p.append(
      node(
        "p",
        "Cette conversation est archivée ou vos droits ne permettent pas d’y inviter quelqu’un. Vous pouvez démarrer une nouvelle conversation.",
      ),
      button("Nouveau message", () => createRoom(), "primary"),
    );
    return;
  }
  const existing = room
    .getMembers()
    .filter((m: any) => ["join", "invite"].includes(m.membership))
    .map((m: any) => m.userId.split(":")[0].slice(1));
  const multiple = ["responsable", "administrateur"].includes(
    role(client.getUserId()),
  );
  if (!multiple && existing.length >= 2) {
    p.append(
      node(
        "p",
        "Un responsable doit créer un groupe pour ajouter d’autres personnes.",
      ),
    );
    return;
  }
  p.append(
    node(
      "p",
      "Le collègue recevra une invitation à accepter dans sa messagerie.",
    ),
  );
  const submit = contactPicker(
    p,
    async (ids) => {
      for (const id of ids)
        await client.invite(room.roomId, "@" + id + ":" + location.hostname);
      p.replaceChildren(
        node("h2", "Invitation envoyée"),
        node(
          "p",
          "Votre collègue peut maintenant l’accepter dans sa messagerie.",
        ),
        button("Terminer", closePanel, "primary"),
      );
    },
    false,
    existing,
  );
  submit.textContent = "Envoyer l’invitation";
}
function showChatOptions() {
  const p = panel("Options de la conversation");
  p.append(button("Dossiers administratifs", showDossiers));
  p.append(button("Suivre les instructions et dossiers", showInstructionBoard));
  if (["responsable", "administrateur"].includes(role(client.getUserId())))
    p.append(button("Créer une instruction de service", instruction));
  p.append(
    button("Vérifier les appareils", showDevices),
    button("Quitter la conversation", async () => {
      if (!confirm("Quitter cette conversation ?")) return;
      await client.leave(roomId);
      roomId = "";
      root.classList.remove("room-open");
      closePanel();
      rooms();
      $("chat").replaceChildren(
        node(
          "p",
          "Choisissez une conversation pour continuer.",
          "chat-empty-message",
        ),
      );
    }),
  );
}
function showMembers() {
  const room = client.getRoom(roomId),
    p = panel("Participants");
  for (const member of room
    .getMembers()
    .filter(
      (m: any) =>
        ["join", "invite"].includes(m.membership) &&
        !m.userId.startsWith("@faso-operator:"),
    )) {
    const row = node("div", undefined, "member-row");
    row.append(
      node("span", displayName(member.userId)),
      node(
        "small",
        member.membership === "invite"
          ? "Invitation en attente"
          : "Dans la conversation",
      ),
    );
    if (
      ["responsable", "administrateur"].includes(role(client.getUserId())) &&
      (room.currentState.getMember(client.getUserId())?.powerLevel || 0) >=
        50 &&
      member.userId !== client.getUserId()
    )
      row.append(
        button("Retirer", async () => {
          await client.kick(roomId, member.userId, "Retrait du groupe");
          showMembers();
        }),
      );
    p.append(row);
  }
  if (canInvite(room))
    p.append(button("+ Inviter un collègue", showInvite, "primary"));
}
let pendingConversation: { key: string; id: string } | undefined;
async function startConversation(rawIds: string[], name = "") {
  const self = client.getUserId().split(":")[0].slice(1),
    allowed = ["responsable", "administrateur"].includes(
      role(client.getUserId()),
    );
  const ids = selectedInvitees(rawIds, self, agents, allowed);
  const key = JSON.stringify([self, [...ids].sort(), name.trim()]);
  if (pendingConversation?.key === key) {
    await openRoom(pendingConversation.id);
    pendingConversation = undefined;
    return;
  }
  if (ids.length === 1 && !name.trim()) {
    const other = "@" + ids[0] + ":" + location.hostname;
    const existing = client
      .getRooms()
      .filter(
        (r: any) =>
          r.getMyMembership() === "join" &&
          !archivedRoom(r) &&
          directConversationKey(r) &&
          r.hasEncryptionStateEvent(),
      )
      .filter((r: any) => {
        const members = r
          .getMembers()
          .filter((m: any) => ["join", "invite"].includes(m.membership));
        return (
          members.length === 2 && members.some((m: any) => m.userId === other)
        );
      })
      .sort(
        (a: any, b: any) =>
          b.getLastActiveTimestamp() - a.getLastActiveTimestamp(),
      )[0];
    if (existing) return openRoom(existing.roomId);
  }
  const result = await client.createRoom({
    preset: "private_chat",
    visibility: "private",
    ...(name.trim() ? { name: name.trim().slice(0, 100) } : {}),
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
  pendingConversation = { key, id: result.room_id };
  status("Conversation créée. Réception des informations…");
  rooms();
  await openRoom(result.room_id);
  pendingConversation = undefined;
}
async function createRoom() {
  await directory();
  const p = panel("Un nouveau message");
  p.append(
    node(
      "p",
      "Choisissez votre destinataire. Nous nous occupons de l’invitation.",
    ),
  );
  const group = ["responsable", "administrateur"].includes(
    role(client.getUserId()),
  );
  const name = node("input") as HTMLInputElement;
  name.placeholder = "Nom du groupe, facultatif";
  name.maxLength = 100;
  name.setAttribute("aria-label", "Nom du groupe, facultatif");
  if (group) p.append(name);
  const submit = contactPicker(
    p,
    (ids) => startConversation(ids, group ? name.value : ""),
    group,
  );
  submit.textContent = "Ouvrir la conversation";
}
async function verifiedRecipients(targetRoomId = roomId) {
  const room = client.getRoom(targetRoomId);
  if (room?.getMyMembership() !== "join" || archivedRoom(room))
    throw new Error("Cette conversation n’est plus active pour votre compte.");
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
async function send(type: string, content: any, targetRoomId = roomId) {
  if (!navigator.onLine)
    throw new Error(
      "Hors ligne. Le brouillon reste uniquement dans cette fenêtre.",
    );
  if (busy) throw new Error("Un envoi est déjà en cours.");
  busy = true;
  updateSendControls();
  try {
    await safeSender.send(targetRoomId, type, content);
    status("Événement chiffré envoyé.");
  } finally {
    busy = false;
    updateSendControls();
  }
}
let roomOpenGeneration = 0;
async function openRoom(id: string) {
  const generation = ++roomOpenGeneration;
  const room = await waitForSyncedRoom(client, id);
  if (generation !== roomOpenGeneration) return;
  closePanel();
  root.classList.add("room-open");
  $("chat").classList.remove("empty-chat");
  roomId = id;
  reply = null;
  query = "";
  controls.clear();
  rooms();
  const chat = $("chat");
  const heading = node("div", undefined, "chat-header"),
    title = node("div", undefined, "chat-heading");
  const back = button(
    "←",
    () => root.classList.remove("room-open"),
    "back-to-list",
  );
  back.setAttribute("aria-label", "Revenir aux conversations");
  title.append(
    node("h1", roomTitle(room)),
    node("div", "Messages privés et protégés", "meta"),
  );
  const actions = node("div", undefined, "actions chat-actions");
  const options = button("⋯", showChatOptions, "chat-menu");
  options.setAttribute("aria-label", "Options de la conversation");
  actions.append(
    button("Dossiers", showDossiers),
    button("Instructions", showInstructionBoard),
    button("Participants", showMembers),
    button("+ Inviter", showInvite, "invite-action"),
    button("Rechercher", () => {
      const field = $("chat-search") as HTMLInputElement;
      field.hidden = !field.hidden;
      if (!field.hidden) field.focus();
    }),
    options,
  );
  heading.append(
    back,
    node("span", roomTitle(room).slice(0, 1).toUpperCase(), "room-avatar"),
    title,
    actions,
  );
  chat.replaceChildren(heading);
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
  search.id = "chat-search";
  search.hidden = true;
  search.placeholder = "Rechercher un message…";
  search.setAttribute("aria-label", "Recherche locale dans la conversation");
  search.oninput = () => {
    query = search.value.toLowerCase();
    renderMessages();
  };
  chat.append(
    search,
    button(
      "Afficher les messages précédents",
      async () => {
        await client.scrollback(room, 50);
        renderMessages();
      },
      "history-button",
    ),
  );
  const messages = node("div", undefined, "messages");
  messages.id = "messages";
  chat.append(messages);
  const compose = node("form", undefined, "composer") as HTMLFormElement;
  const input = node("textarea") as HTMLTextAreaElement;
  input.id = "message-draft";
  input.value = drafts.get(id) || "";
  input.oninput = () => {
    if (input.value) drafts.set(id, input.value);
    else drafts.delete(id);
  };
  input.placeholder = "Votre message…";
  input.setAttribute("aria-label", "Message");
  const submit = node("button", "Envoyer", "primary") as HTMLButtonElement;
  submit.type = "submit";
  submit.dataset.sendAction = "true";
  controls.add(submit);
  const blocked = archivedRoom(room);
  input.disabled = blocked;
  submit.disabled = blocked;
  if (blocked)
    input.placeholder =
      "Conversation archivée · Ouvrez la conversation actuelle pour écrire.";
  compose.append(input, submit);
  compose.onsubmit = async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    submit.disabled = true;
    try {
      const submitted = input.value;
      const body: any = { msgtype: "m.text", body: submitted };
      if (reply)
        body["m.relates_to"] = { "m.in_reply_to": { event_id: reply } };
      await send("m.room.message", body, id);
      if (input.value === submitted) {
        input.value = "";
        drafts.delete(id);
      }
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
      await uploadFile(selected, id);
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
  attach.textContent = "＋";
  attach.title = "Joindre un fichier";
  attach.setAttribute("aria-label", "Joindre un fichier");
  compose.prepend(attach);
  const voice = button("Message vocal", () =>
    openVoiceRecorder({
      panel,
      button,
      node,
      upload: async (clip: Blob, info: any) => {
        if (!navigator.onLine)
          throw new Error(
            "Connexion nécessaire pour envoyer le vocal. Il reste disponible dans cette fenêtre.",
          );
        await verifiedRecipients(id);
        const encrypted = await encryptAttachment(await clip.arrayBuffer());
        const uploaded = await client.uploadContent(
          new Blob([encrypted.data]),
          { type: "application/octet-stream", includeFilename: false },
        );
        await send(
          "m.room.message",
          {
            msgtype: "m.audio",
            body: "Message vocal",
            info: {
              mimetype: clip.type,
              size: clip.size,
              duration: info.duration,
            },
            voice_language: info.language,
            file: { ...encrypted.info, url: uploaded.content_uri },
          },
          id,
        );
      },
    }),
  );
  voice.type = "button";
  voice.disabled = blocked;
  compose.prepend(voice);
  chat.append(compose, file);
  renderMessages();
}
function validInstruction(event: any, room: any) {
  return (
    event.isEncrypted() &&
    !event.isDecryptionFailure() &&
    !event.isRedacted() &&
    event.getType() === "bf.fasoconnect.instruction" &&
    validateInstruction(
      {
        roomId: event.getRoomId(),
        sender: event.getSender(),
        content: event.getContent(),
      },
      {
        roomId: room.roomId,
        members: room.getJoinedMembers().map((m: any) => m.userId),
        role: role(event.getSender()),
        power: room.currentState.getMember(event.getSender())?.powerLevel || 0,
      },
    )
  );
}
function workflowEvent(event: any) {
  return {
    id: event.getId(),
    roomId: event.getRoomId(),
    sender: event.getSender(),
    type: event.getType(),
    content: event.getContent(),
    ts: event.getTs(),
    encrypted:
      event.isEncrypted() &&
      !event.isDecryptionFailure() &&
      !event.isRedacted(),
  };
}
function dossierContext(room: any) {
  const members = room.getJoinedMembers().map((m: any) => m.userId);
  return {
    roomId: room.roomId,
    members,
    managers: members.filter(
      (id: string) =>
        ["responsable", "administrateur"].includes(role(id)) &&
        (room.currentState.getMember(id)?.powerLevel || 0) >= 50,
    ),
  };
}
function roomDossiers(room: any) {
  return room
    .getLiveTimeline()
    .getEvents()
    .filter((event: any) =>
      validateDossier(workflowEvent(event), dossierContext(room)),
    );
}
function showDossiers() {
  const room = client.getRoom(roomId);
  if (!room)
    throw new Error("Ouvrez une conversation pour consulter ses dossiers.");
  const p = panel("Dossiers de la conversation");
  p.append(
    node(
      "p",
      "Chaque dossier partage les participants de cette conversation. Sa référence, son titre et ses notes sont chiffrés. Seuls les éléments chargés sur cet appareil sont affichés.",
    ),
  );
  const dossiers = roomDossiers(room);
  if (!dossiers.length)
    p.append(node("p", "Aucun dossier disponible dans les messages chargés."));
  for (const event of dossiers)
    p.append(
      button(
        `${event.getContent().reference} · ${event.getContent().title}`,
        () => showDossier(event, room),
      ),
    );
  if (
    !archivedRoom(room) &&
    dossierContext(room).managers.includes(client.getUserId())
  )
    p.append(button("Ouvrir un dossier", () => createDossier(room), "primary"));
  p.append(
    button("Charger les dossiers précédents", async () => {
      await client.scrollback(room, 100);
      if (roomId !== room.roomId)
        throw new Error("La conversation ouverte a changé.");
      showDossiers();
    }),
  );
}
function createDossier(room: any) {
  const p = panel("Ouvrir un dossier chiffré");
  const reference = node("input") as HTMLInputElement,
    title = node("input") as HTMLInputElement,
    description = node("textarea") as HTMLTextAreaElement;
  for (const [field, id, label, max] of [
    [reference, "reference", "Référence du dossier", 60],
    [title, "title", "Titre du dossier", 120],
    [description, "description", "Description (facultative)", 4000],
  ] as const) {
    field.id = "dossier-" + id;
    field.maxLength = max;
    const text = node("label", label);
    text.setAttribute("for", field.id);
    p.append(text, field);
  }
  p.append(
    node(
      "p",
      "Les participants de la conversation auront accès aux nouveaux éléments du dossier ; aucun nouveau membre n’est ajouté.",
    ),
    sendButton(
      "Créer le dossier",
      async () => {
        if (!reference.value.trim() || !title.value.trim())
          throw new Error("La référence et le titre sont obligatoires.");
        if (!dossierContext(room).managers.includes(client.getUserId()))
          throw new Error("Vos droits ont changé.");
        await send(
          DOSSIER_EVENT,
          {
            reference: reference.value.trim(),
            title: title.value.trim(),
            description: description.value.trim(),
          },
          room.roomId,
        );
        showDossiers();
      },
      "primary",
    ),
  );
}
function showDossier(event: any, room: any) {
  if (!validateDossier(workflowEvent(event), dossierContext(room)))
    throw new Error("Dossier indisponible ou droits modifiés.");
  const c = event.getContent(),
    p = panel(`${c.reference} · ${c.title}`);
  p.append(node("p", c.description || "Aucune description."));
  const events = room.getLiveTimeline().getEvents(),
    descriptor = workflowEvent(event);
  p.append(node("h3", "Instructions"));
  const linked = events.filter(
    (e: any) =>
      validInstruction(e, room) && e.getContent().dossier_id === event.getId(),
  );
  if (!linked.length)
    p.append(node("p", "Aucune instruction chargée pour ce dossier."));
  for (const task of linked) {
    const card = node("article", undefined, "workflow-card");
    card.append(node("h4", task.getContent().subject));
    renderInstructionProgress(card, task, room, events);
    p.append(card);
  }
  p.append(node("h3", "Notes et comptes rendus"));
  const notes = events.filter((e: any) =>
    validateDossierNote(workflowEvent(e), descriptor, dossierContext(room)),
  );
  if (!notes.length)
    p.append(node("p", "Aucune note chargée pour ce dossier."));
  for (const note of notes)
    p.append(
      node("p", `${displayName(note.getSender())} · ${note.getContent().body}`),
    );
  p.append(node("h3", "Documents"));
  const documents = events.filter(
    (e: any) =>
      e.isEncrypted() &&
      !e.isDecryptionFailure() &&
      !e.isRedacted() &&
      e.getType() === "m.room.message" &&
      e.getContent().file &&
      e.getContent().dossier_id === event.getId(),
  );
  if (!documents.length)
    p.append(node("p", "Aucun document chargé pour ce dossier."));
  for (const file of documents)
    p.append(
      button(file.getContent().body || "Document", () =>
        download(file.getContent()),
      ),
    );
  if (!archivedRoom(room) && room.getMyMembership() === "join") {
    const actions = node("div", undefined, "actions");
    if (dossierContext(room).managers.includes(client.getUserId()))
      actions.append(
        button("Ajouter une instruction", () => instruction(event)),
      );
    actions.append(
      button("Ajouter une note", () => {
        const form = panel("Note du dossier"),
          field = node("textarea") as HTMLTextAreaElement;
        field.maxLength = 4000;
        field.setAttribute("aria-label", "Contenu de la note");
        form.append(
          node("p", `${c.reference} · ${c.title}`),
          field,
          sendButton(
            "Publier la note chiffrée",
            async () => {
              if (!field.value.trim())
                throw new Error("Rédigez une note avant de la publier.");
              await send(
                DOSSIER_NOTE_EVENT,
                { dossier_id: event.getId(), body: field.value.trim() },
                room.roomId,
              );
              showDossier(event, room);
            },
            "primary",
          ),
        );
      }),
    );
    p.append(actions);
    const file = node("input") as HTMLInputElement;
    file.type = "file";
    file.setAttribute("aria-label", "Document du dossier, 10 Mo maximum");
    p.append(
      file,
      sendButton("Joindre le document chiffré", async () => {
        if (!file.files?.[0]) throw new Error("Choisissez un document.");
        await uploadFile(file.files[0], room.roomId, {
          dossier_id: event.getId(),
        });
        showDossier(event, room);
      }),
    );
  }
  p.append(
    button("Actualiser le dossier", () => showDossier(event, room)),
    button("Tous les dossiers", showDossiers),
  );
}
function workflowInstruction(event: any) {
  return {
    id: event.getId(),
    roomId: event.getRoomId(),
    sender: event.getSender(),
    content: event.getContent(),
  };
}
const progressButtons = {
  en_cours: "Commencer le travail",
  a_valider: "Soumettre au responsable",
  termine: "Valider le travail",
  a_reprendre: "Demander une reprise",
};
function renderInstructionProgress(
  container: HTMLElement,
  event: any,
  room: any,
  events: any[],
) {
  const instruction = workflowInstruction(event);
  const progress = instructionProgress(instruction, events.map(workflowEvent));
  const section = node("section", undefined, "instruction-progress");
  section.setAttribute("aria-label", "Suivi de réalisation de l’instruction");
  if (!event.getId()?.startsWith("$")) {
    section.append(node("p", "Publication de l’instruction en cours…"));
    container.append(section);
    return;
  }
  const opaque = events.some(
    (e: any) =>
      e.getTs() >= event.getTs() &&
      e.isEncrypted() &&
      !e.isRedacted() &&
      (e.isDecryptionFailure() || e.getType() === "m.room.encrypted"),
  );
  if (opaque)
    section.append(
      node(
        "p",
        "Des messages récents ne sont pas encore déchiffrés. Le suivi ne peut pas être confirmé.",
        "workflow-warning",
      ),
    );
  section.append(
    node(
      "strong",
      `Exécutions validées : ${progress.completed} / ${progress.items.length}`,
    ),
  );
  if (progress.closed && !opaque)
    section.append(
      node("p", "Tous les travaux ont été validés par le responsable."),
    );
  for (const item of progress.items) {
    const row = node("div", undefined, "instruction-progress-row");
    row.append(
      node(
        "p",
        `${displayName(item.recipient)} · ${WORKFLOW_LABELS[item.status]}`,
      ),
    );
    if (item.conflict || item.missingHistory) {
      row.append(
        node(
          "p",
          item.conflict
            ? "Décisions concurrentes : faites le point avec le responsable avant de publier une nouvelle instruction."
            : "Historique incomplet : chargez les messages précédents pour reconstituer ce suivi.",
          "workflow-warning",
        ),
      );
    } else if (
      !opaque &&
      !archivedRoom(room) &&
      room.getMyMembership() === "join"
    ) {
      for (const next of allowedTransitions(
        item.status,
        client.getUserId(),
        instruction,
        item.recipient,
      )) {
        row.append(
          button(progressButtons[next], () => {
            const target = room.roomId,
              previous = item.previousId;
            const p = panel(progressButtons[next]);
            p.append(
              node(
                "p",
                `${event.getContent().subject} · ${displayName(item.recipient)}`,
              ),
            );
            const label = node(
              "label",
              next === "a_reprendre"
                ? "Motif de reprise (obligatoire)"
                : "Commentaire (facultatif)",
            );
            const comment = node("textarea") as HTMLTextAreaElement;
            comment.id = "workflow-comment";
            comment.maxLength = 2000;
            label.setAttribute("for", comment.id);
            p.append(
              label,
              comment,
              sendButton(
                "Confirmer",
                async () => {
                  if (next === "a_reprendre" && !comment.value.trim())
                    throw new Error("Expliquez ce qui doit être repris.");
                  const currentRoom = client.getRoom(target);
                  const currentEvents = currentRoom
                    .getLiveTimeline()
                    .getEvents();
                  const original = currentEvents.find(
                    (e: any) => e.getId() === instruction.id,
                  );
                  if (!original || !validInstruction(original, currentRoom))
                    throw new Error(
                      "Instruction indisponible ou droits modifiés.",
                    );
                  const current = instructionProgress(
                    instruction,
                    currentEvents.map(workflowEvent),
                  ).items.find((x: any) => x.recipient === item.recipient);
                  if (
                    !current ||
                    current.conflict ||
                    current.missingHistory ||
                    current.previousId !== previous ||
                    !allowedTransitions(
                      current.status,
                      client.getUserId(),
                      instruction,
                      item.recipient,
                    ).includes(next)
                  )
                    throw new Error(
                      "Le suivi a changé. Fermez cette fenêtre et consultez son état actuel.",
                    );
                  await send(
                    WORKFLOW_EVENT,
                    {
                      instruction_id: instruction.id,
                      recipient: item.recipient,
                      status: next,
                      previous_id: previous,
                      ...(comment.value.trim()
                        ? { comment: comment.value.trim() }
                        : {}),
                    },
                    target,
                  );
                  closePanel();
                  renderMessages();
                },
                "primary",
              ),
            );
            comment.focus();
          }),
        );
      }
    }
    if (item.history.length) {
      const details = node("details");
      details.append(node("summary", "Voir le suivi"));
      for (const change of item.history)
        details.append(
          node(
            "p",
            `${displayName(change.sender)} · ${WORKFLOW_LABELS[change.content.status]}${change.content.comment ? " — " + change.content.comment : ""}`,
          ),
        );
      row.append(details);
    }
    section.append(row);
  }
  container.append(section);
}
function showInstructionBoard() {
  const room = client.getRoom(roomId);
  if (!room)
    throw new Error("Ouvrez une conversation pour consulter ses instructions.");
  const p = panel("Instructions et dossiers"),
    events = room.getLiveTimeline().getEvents();
  p.append(
    node(
      "p",
      "Suivi calculé sur cet appareil à partir des messages chargés et déchiffrés. Les accusés de prise de connaissance restent distincts du travail réalisé.",
    ),
  );
  p.append(button("Actualiser le suivi", showInstructionBoard));
  const records = events.filter((e: any) => validInstruction(e, room));
  const dossiers = roomDossiers(room);
  const groups = new Map<string, any[]>();
  for (const event of records) {
    const c = event.getContent(),
      dossier = dossiers
        .find((d: any) => d.getId() === c.dossier_id)
        ?.getContent();
    const name = dossier
      ? `${dossier.reference} · ${dossier.title}`
      : c.dossier || (c.dossier_id ? "Dossier non chargé" : "Sans dossier");
    groups.set(name, [...(groups.get(name) || []), event]);
  }
  if (!records.length)
    p.append(
      node("p", "Aucune instruction disponible dans les messages chargés."),
    );
  for (const [name, instructions] of groups) {
    p.append(node("h3", name));
    for (const event of instructions) {
      const card = node("article", undefined, "workflow-card");
      card.append(node("h4", event.getContent().subject));
      renderInstructionProgress(card, event, room, events);
      p.append(card);
    }
  }
  p.append(
    button("Charger les instructions précédentes", async () => {
      await client.scrollback(room, 100);
      if (roomId !== room.roomId)
        throw new Error("La conversation ouverte a changé.");
      showInstructionBoard();
    }),
  );
}
function renderMessages() {
  const box = $("messages");
  if (!box || !roomId) return;
  const room = client.getRoom(roomId),
    events = room?.getLiveTimeline().getEvents() || [];
  box.replaceChildren();
  if (
    !events.some(
      (e: any) =>
        !e.isState() &&
        [
          "m.room.message",
          "m.room.encrypted",
          "bf.fasoconnect.instruction",
        ].includes(e.getType()),
    )
  )
    box.append(
      node(
        "div",
        "Votre conversation est prête. Écrivez votre premier message ci-dessous.",
        "chat-empty-message",
      ),
    );
  for (const event of events) {
    if (event.isState()) continue;
    const c = event.getContent();
    if (
      ["bf.fasoconnect.ack", WORKFLOW_EVENT, DOSSIER_NOTE_EVENT].includes(
        event.getType(),
      )
    )
      continue;
    if (
      query &&
      !(
        (c.body || "") +
        " " +
        (c.subject || "") +
        " " +
        (c.title || "") +
        " " +
        (c.reference || "")
      )
        .toLowerCase()
        .includes(query)
    )
      continue;
    const b = node(
      "article",
      undefined,
      event.getSender() === client.getUserId() ? "bubble outgoing" : "bubble",
    );
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
    } else if (validateDossier(workflowEvent(event), dossierContext(room))) {
      b.append(
        node("strong", `Dossier ${c.reference}`),
        node("p", c.title),
        button("Ouvrir le dossier", () => showDossier(event, room)),
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
            (c.deadline
              ? " · Échéance : " + new Date(c.deadline).toLocaleString("fr-FR")
              : ""),
          "priority",
        ),
      );
      if (c.dossier) b.append(node("p", "Dossier : " + c.dossier, "meta"));
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
          sendButton("J’ai pris connaissance", () =>
            send("bf.fasoconnect.ack", {
              instruction_id: event.getId(),
              acknowledged: true,
            }),
          ),
        );
      renderInstructionProgress(b, event, room, events);
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
      if (c.msgtype === "m.audio" && c.file) {
        const labels = {
          mos: "Mooré",
          dyu: "Dioula",
          ff: "Fulfuldé",
          fr: "Français",
          other: "Autre langue",
        };
        b.append(
          node(
            "p",
            "Vocal · " + (labels[c.voice_language] || "Langue non précisée"),
          ),
        );
        b.append(
          button("Déchiffrer et écouter", async () => {
            const bytes = await decryptMedia(c);
            const mime = /^audio\/(webm|ogg|mp4|mpeg|wav)(;.*)?$/.test(
              c.info?.mimetype,
            )
              ? c.info.mimetype
              : "audio/webm";
            const audio = node("audio") as HTMLAudioElement;
            audio.controls = true;
            const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
            audio.src = url;
            b.append(audio);
            audio.addEventListener("ended", () => URL.revokeObjectURL(url), {
              once: true,
            });
            setTimeout(() => URL.revokeObjectURL(url), 300000);
            await audio.play();
          }),
        );
      }
      if (event.status) {
        b.append(
          node(
            "p",
            event.status === "not_sent"
              ? "Envoi non confirmé. Une nouvelle tentative est nécessaire."
              : "Envoi en cours…",
            "meta",
          ),
        );
        if (event.status === "not_sent") {
          b.append(
            button("Réessayer cet envoi", () =>
              send(event.getType(), event.getContent(), event.getRoomId()),
            ),
            button("Abandonner cette tentative", () => {
              safeSender.discard(
                event.getRoomId(),
                event.getType(),
                event.getContent(),
              );
              renderMessages();
              status(
                "Tentative abandonnée. Un message déjà reçu par le serveur ne peut pas être annulé par cette action.",
              );
            }),
          );
        }
      }
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
async function uploadFile(selected: File, target: string, extra = {}) {
  if (selected.size > 10 * 1024 * 1024)
    throw new Error("Fichier limité à 10 Mo.");
  if (!navigator.onLine)
    throw new Error(
      "Connexion nécessaire pour envoyer un fichier. Le fichier n’a pas été envoyé.",
    );
  await verifiedRecipients(target);
  const encrypted = await encryptAttachment(await selected.arrayBuffer());
  const uploaded = await client.uploadContent(new Blob([encrypted.data]), {
    type: "application/octet-stream",
    includeFilename: false,
  });
  await send(
    "m.room.message",
    {
      msgtype: "m.file",
      body: selected.name,
      info: { mimetype: selected.type, size: selected.size },
      file: { ...encrypted.info, url: uploaded.content_uri },
      ...extra,
    },
    target,
  );
}
async function decryptMedia(c: any) {
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
  return decryptAttachment(await r.arrayBuffer(), c.file);
}
async function download(c: any) {
  const bytes = await decryptMedia(c);
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/octet-stream" }),
  );
  const a = node("a") as HTMLAnchorElement;
  a.href = url;
  a.download = c.body || "fichier";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function instruction(selectedDossier?: any) {
  if (selectedDossier && selectedDossier.getRoomId() !== roomId)
    throw new Error(
      "Ouvrez la conversation du dossier avant d’ajouter une instruction.",
    );
  if (!["responsable", "administrateur"].includes(role(client.getUserId())))
    throw new Error("Un responsable publie les instructions.");
  const targetRoomId = roomId;
  const p = panel("Instruction de service"),
    subject = node("input") as HTMLInputElement,
    body = node("textarea") as HTMLTextAreaElement,
    priority = node("select") as HTMLSelectElement,
    deadline = node("input") as HTMLInputElement,
    dossier = node("input") as HTMLInputElement;
  subject.maxLength = 200;
  body.maxLength = 16000;
  dossier.maxLength = 120;
  dossier.placeholder = "Référence du dossier (facultatif, chiffré)";
  const dossierChoice = node("select") as HTMLSelectElement;
  dossierChoice.id = "instruction-dossier-choice";
  const none = node("option", "Aucun dossier existant") as HTMLOptionElement;
  none.value = "";
  dossierChoice.append(none);
  for (const event of roomDossiers(client.getRoom(targetRoomId))) {
    const option = node(
      "option",
      `${event.getContent().reference} · ${event.getContent().title}`,
    ) as HTMLOptionElement;
    option.value = event.getId();
    dossierChoice.append(option);
  }
  if (selectedDossier) dossierChoice.value = selectedDossier.getId();
  const dossierLabel = node("label", "Rattacher à un dossier existant");
  dossierLabel.setAttribute("for", dossierChoice.id);
  p.append(dossierLabel, dossierChoice);
  subject.placeholder = "Objet";
  body.placeholder = "Contenu de l’instruction";
  deadline.type = "datetime-local";
  const recipientsBox = node("fieldset");
  recipientsBox.append(node("legend", "Agents chargés de l’exécution"));
  const recipientInputs = client
    .getRoom(targetRoomId)
    .getJoinedMembers()
    .filter((m: any) => m.userId !== client.getUserId())
    .map((m: any) => {
      const label = node("label", undefined, "workflow-recipient");
      const input = node("input") as HTMLInputElement;
      input.type = "checkbox";
      input.value = m.userId;
      input.checked = true;
      label.append(input, document.createTextNode(displayName(m.userId)));
      recipientsBox.append(label);
      return input;
    });
  for (const [field, text] of [
    [subject, "Objet"],
    [body, "Instruction"],
    [priority, "Priorité"],
    [deadline, "Échéance locale (facultative)"],
    [dossier, "Dossier (facultatif)"],
  ] as const) {
    const label = node("label", text);
    field.id =
      "instruction-" +
      (field === subject
        ? "subject"
        : field === body
          ? "body"
          : field === priority
            ? "priority"
            : field === deadline
              ? "deadline"
              : "dossier");
    label.setAttribute("for", field.id);
    p.append(label, field);
  }
  for (const value of ["normale", "haute", "urgente"]) {
    const o = node("option", value) as HTMLOptionElement;
    o.value = value;
    priority.append(o);
  }
  p.append(
    recipientsBox,
    sendButton(
      "Publier chiffré",
      async () => {
        if (!subject.value.trim() || !body.value.trim())
          throw new Error("Objet et contenu requis");
        const room = client.getRoom(targetRoomId);
        const recipients = recipientInputs
          .filter((input: HTMLInputElement) => input.checked)
          .map((input: HTMLInputElement) => input.value);
        if (!recipients.length)
          throw new Error(
            "Choisissez au moins un agent chargé de l’exécution.",
          );
        if (
          dossierChoice.value &&
          !roomDossiers(room).some(
            (event: any) => event.getId() === dossierChoice.value,
          )
        )
          throw new Error(
            "Le dossier sélectionné n’est plus disponible. Actualisez la conversation.",
          );
        const content = {
          subject: subject.value.trim(),
          body: body.value.trim(),
          priority: priority.value,
          deadline: deadline.value
            ? new Date(deadline.value).toISOString()
            : null,
          recipients,
          ...(dossierChoice.value ? { dossier_id: dossierChoice.value } : {}),
          ...(dossier.value.trim() ? { dossier: dossier.value.trim() } : {}),
        };
        if (
          !validateInstruction(
            { roomId: targetRoomId, sender: client.getUserId(), content },
            {
              roomId: targetRoomId,
              members: room.getJoinedMembers().map((m: any) => m.userId),
              role: role(client.getUserId()),
              power:
                room.currentState.getMember(client.getUserId())?.powerLevel ||
                0,
            },
          )
        )
          throw new Error(
            "Vos droits ou les destinataires ont changé. Vérifiez la conversation.",
          );
        await send("bf.fasoconnect.instruction", content, targetRoomId);
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
    `<main class="welcome-layout"><section class="welcome-story"><div class="eyebrow">VOTRE ESPACE DE TRAVAIL</div><h1>Les bons échanges.<br><em>En toute confiance.</em></h1><p>Vos collègues, vos conversations et vos idées.<br>Réunis dans un espace simple et protégé.</p><div class="welcome-tags"><span>Messages privés</span><span>Dossiers chiffrés</span><span>Vocaux en mooré</span></div><div class="conversation-art" aria-hidden="true"><div class="art-top"><span class="art-avatar">A</span><div><b>Votre équipe</b><small>Une conversation qui avance.</small></div><span class="art-dot"></span></div><div class="art-message">Bonjour ! Le document est prêt pour notre réunion.</div><div class="art-message art-own">Parfait, merci. À tout à l’heure !<span>✓✓</span></div><div class="art-footer"><span>✦</span> Un peu d’aide, beaucoup de simplicité.</div></div><small class="welcome-signature">FasoConnect · Pensé pour vos échanges de service.</small></section><section class="login-card"><div class="eyebrow">HEUREUX DE VOUS RETROUVER</div><h2>Bienvenue chez vous.</h2><p>Connectez-vous pour retrouver votre équipe.</p><div id="welcome-action"></div><div class="login-steps"><span><b>1</b> Votre identifiant et votre mot de passe</span><span><b>2</b> Le code à 6 chiffres de votre téléphone</span></div><details class="login-help"><summary>Première connexion ?</summary><p>Votre administrateur vous remet votre accès. Après avoir choisi votre mot de passe, scannez le QR code affiché avec votre application d’authentification. Elle générera vos codes de connexion.</p><p>Un code ne fonctionne pas ? Vérifiez l’heure automatique du téléphone et attendez le code suivant.</p></details><small>Ce navigateur conserve les clés nécessaires à vos échanges. Utilisez votre appareil personnel et verrouillez votre session.</small></section></main>`;
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
    localTimeoutMs: 30000,
    scheduler: new sdk.MatrixScheduler(() => -1),
  });
  safeSender = createSafeSender(client, async (target) => {
    await client.whoami();
    await verifiedRecipients(target);
  });
  await client.initRustCrypto({ cryptoDatabasePrefix: "faso-" + s.device_id });
  await directory();
  $("content").innerHTML =
    '<div class="shell"><aside id="rooms" aria-label="Conversations et outils"></aside><main class="chat empty-chat" id="chat"><div class="empty-state"><span class="empty-symbol">F</span><h1>Vos messages</h1><p>Sélectionnez une conversation<br>ou choisissez un contact pour commencer.</p><div id="empty-actions" class="actions"></div><small>Vos échanges sont privés et protégés.</small></div></main></div>';
  $("empty-actions").append(button("Nouveau message", createRoom, "primary"));
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
  client.on("Room.localEchoUpdated", () => renderMessages());
  await client.startClient({ initialSyncLimit: 100 });
  setInterval(poll, 5000);
  rooms();
}
window.addEventListener("offline", () =>
  status("Hors ligne : le brouillon reste en mémoire, sans envoi automatique."),
);
window.addEventListener("online", () =>
  status(
    "Connexion retrouvée. Vérifiez vos messages en attente et relancez leur envoi manuellement.",
  ),
);
void installUpdates(() => busy, status);
main().catch((e: any) => status(humanError(e)));
