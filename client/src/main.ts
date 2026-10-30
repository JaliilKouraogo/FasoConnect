import loglevel from "loglevel";
import "./style.css";
import "./messenger.css";
import { openAssistant } from "./assistant";
import { installUpdates } from "./updates";
import {
  selectedInvitees,
  waitForSyncedRoom,
  partitionConversations,
} from "./conversations.js";
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
const controls = new Set<HTMLButtonElement>();
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
  tools.append(
    button("✦ Assistant IA", showAssistant, "assistant-entry"),
    button("Annuaire des collègues", showDirectory),
  );
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
let roomOpenGeneration = 0;
async function openRoom(id: string) {
  const generation = ++roomOpenGeneration;
  const room = await waitForSyncedRoom(client, id);
  if (generation !== roomOpenGeneration) return;
  closePanel();
  root.classList.add("room-open");
  $("chat").classList.remove("empty-chat");
  roomId = id;
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
  input.placeholder = "Votre message…";
  input.setAttribute("aria-label", "Message");
  const submit = node("button", "Envoyer", "primary") as HTMLButtonElement;
  submit.type = "submit";
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
  attach.textContent = "＋";
  attach.title = "Joindre un fichier";
  attach.setAttribute("aria-label", "Joindre un fichier");
  compose.prepend(attach);
  chat.append(compose, file);
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
    if (event.getType() === "bf.fasoconnect.ack") continue;
    if (
      query &&
      !((c.body || "") + " " + (c.subject || "")).toLowerCase().includes(query)
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
    '<div class="shell"><aside id="rooms" aria-label="Conversations et outils"></aside><main class="chat empty-chat" id="chat"><div class="empty-state"><span class="empty-symbol">F</span><h1>Vos messages</h1><p>Sélectionnez une conversation<br>ou choisissez un contact pour commencer.</p><div id="empty-actions" class="actions"></div><small>Vos échanges sont privés et protégés.</small></div></main></div>';
  $("empty-actions").append(
    button("Nouveau message", createRoom, "primary"),
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
