import loglevel from "loglevel";
import "./style.css";
import "./messenger.css";
import { openAssistant } from "./assistant";
import { openAIChatbox, type AIChatTurn } from "./ai-chatbox";
import { openAgenda } from "./agenda";
import { createNotificationCenter } from "./notifications";
import { showWelcomeTour, welcomeTourSeen } from "./welcome-tour";
import type { PersonalTask } from "./personal-tasks";
import type {
  DelegationDraft,
  DelegationRoom,
  ProjectPlan,
} from "./project-plan";
import { projectInstruction } from "./project-delegation.js";
import { collectAssistantContext } from "./assistant-context.js";
import { installUpdates } from "./updates";
import { createSafeSender } from "./safe-sender.js";
import { createVoiceRecorder } from "./voice-recorder";
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
import {
  CALL_EVENT,
  directCallPeer,
  newCallId,
  validateCallSignal,
} from "./calls.js";
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
const ICONS = {
  add: '<path d="M12 5v14M5 12h14"/>',
  sparkle:
    '<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="m19 17 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/>',
  folder:
    '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  checklist: '<path d="m4 7 2 2 3-3M12 8h8M4 16l2 2 3-3M12 17h8"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M16 5a3 3 0 0 1 0 6m1 2a5 5 0 0 1 4 5v2"/>',
  invite:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M19 7v6m-3-3h6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  devices:
    '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M8 20h8M12 16v4M18 9h3v11h-6"/>',
  install:
    '<path d="M12 3v12m-4-4 4 4 4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  logout:
    '<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 7l5 5-5 5M8 12h11"/>',
  shield:
    '<path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  back: '<path d="m14 5-7 7 7 7M7 12h14"/>',
  paperclip: '<path d="m9 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 15h3M14 15h3"/>',
  phone:
    '<path d="M5 4h3l2 5-2 2c1 2 3 4 5 5l2-2 5 2v3c0 1-1 2-2 2C10 21 3 14 3 6c0-1 1-2 2-2Z"/>',
  video:
    '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
} as const;
function icon(name: keyof typeof ICONS) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = ICONS[name];
  return svg;
}
let client: any,
  roomId: string,
  agents: any[] = [],
  busy = false,
  reply: any,
  lockRelease: any,
  query = "";
let successors: any[] = [];
let safeSender: ReturnType<typeof createSafeSender>;
let activeVoiceRecorder: ReturnType<typeof createVoiceRecorder> | undefined;
let aiChatHistory: AIChatTurn[] = [];
let disposeAIChat: (() => void) | undefined;
let aiChatOpen = false;
let notifications: ReturnType<typeof createNotificationCenter> | undefined;
let tourShownThisSession = false;
const controls = new Set<HTMLButtonElement>();
let panelReturnFocus: HTMLElement | null = null;
let activeCall:
  | {
      id: string;
      media: "audio" | "video";
      peer: string;
      pc: RTCPeerConnection;
      peers: Map<string, RTCPeerConnection>;
      local: MediaStream;
      remote: MediaStream;
      dialog: HTMLElement;
      localVideo: HTMLVideoElement;
      remoteVideo: HTMLVideoElement;
      screen?: MediaStream;
      notes: string;
      recognition?: any;
      noting: boolean;
    }
  | undefined;
const pendingCallSignals = new Map<string, any[]>();
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
      if (b.dataset.sendAction) updateSendControls();
      else b.disabled = false;
    }
  };
  return b;
}
function iconButton(
  text: string,
  symbol: keyof typeof ICONS,
  action: () => any,
  cls = "",
) {
  const b = button(text, action, `${cls} icon-button`.trim());
  b.replaceChildren(icon(symbol), node("span", text));
  return b;
}
function quickWidget(
  title: string,
  caption: string,
  symbol: keyof typeof ICONS,
  action: () => any,
) {
  const b = button(title, action, "quick-widget");
  const badge = node("span", undefined, "widget-icon");
  badge.append(icon(symbol));
  b.replaceChildren(badge, node("strong", title), node("small", caption));
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
  const previous = document.querySelector(".panel");
  const opener = previous?.contains(document.activeElement)
    ? panelReturnFocus
    : (document.activeElement as HTMLElement | null);
  closePanel();
  panelReturnFocus = opener;
  const p = node("div", undefined, "panel");
  p.setAttribute("role", "dialog");
  p.setAttribute("aria-modal", "true");
  const heading = node("h2", title);
  heading.id = "panel-heading";
  heading.tabIndex = -1;
  p.setAttribute("aria-labelledby", heading.id);
  p.append(button("Fermer", closePanel, "panel-close"), heading);
  p.addEventListener("faso-close", () => {
    if (opener?.isConnected) opener.focus();
  });
  p.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      p.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary",
      ),
    ).filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0],
      last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === heading)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.body.append(p);
  heading.focus();
  return p;
}
function closePanel() {
  const p = document.querySelector(".panel");
  p?.dispatchEvent(new Event("faso-close"));
  p?.remove();
}
function showAssistant(task?: PersonalTask) {
  const id = roomId || "";
  const room = id ? client.getRoom(id) : null;
  const context = task
    ? []
    : collectAssistantContext(
        room?.getLiveTimeline().getEvents() || [],
        (event: any) => validInstruction(event, room),
      );
  return openAssistant({
    token: client.getAccessToken(),
    roomId: id,
    context,
    task: task
      ? { title: task.title, date: task.date, category: task.category }
      : undefined,
    panel,
    locked: () =>
      !sessionStorage.getItem("faso_session") ||
      !client?.getAccessToken() ||
      (roomId || "") !== id ||
      (id && client.getRoom(id)?.getMyMembership() !== "join") ||
      successors.some((s) => s.old === id),
    insertDraft: (answer) => {
      const draft = document.getElementById(
        "message-draft",
      ) as HTMLTextAreaElement;
      if (!draft || draft.disabled)
        throw new Error("Ouvrez une conversation active.");
      if (
        draft.value.trim() &&
        !confirm("Remplacer votre brouillon actuel par cette proposition ?")
      )
        return;
      draft.value = answer;
      draft.dispatchEvent(new Event("input", { bubbles: true }));
      draft.focus();
    },
  });
}
function delegationRooms(): DelegationRoom[] {
  if (!["responsable", "administrateur"].includes(role(client.getUserId())))
    return [];
  return client
    .getRooms()
    .filter(
      (room: any) =>
        room.getMyMembership() === "join" &&
        !archivedRoom(room) &&
        !successors.some((successor) => successor.old === room.roomId) &&
        (room.currentState.getMember(client.getUserId())?.powerLevel || 0) >=
          50,
    )
    .map((room: any) => ({
      id: room.roomId,
      name: roomTitle(room),
      members: room
        .getJoinedMembers()
        .filter((member: any) => member.userId !== client.getUserId())
        .map((member: any) => ({
          id: member.userId,
          name: displayName(member.userId),
        })),
    }))
    .filter((room: DelegationRoom) => room.members.length > 0);
}
async function publishProjectDelegations(
  targetRoomId: string,
  projectId: string,
  projectName: string,
  drafts: DelegationDraft[],
  onSent: (id: string) => Promise<void>,
) {
  for (const draft of drafts) {
    await directory();
    const room = client.getRoom(targetRoomId);
    if (!room || !delegationRooms().some((entry) => entry.id === targetRoomId))
      throw new Error(
        "Vos droits dans cette conversation ont changé. Les tâches restantes ne sont pas envoyées.",
      );
    const alreadySent = room
      .getLiveTimeline()
      .getEvents()
      .some(
        (event: any) =>
          event.getType() === "bf.fasoconnect.instruction" &&
          event.getSender() === client.getUserId() &&
          event.isEncrypted() &&
          !event.isDecryptionFailure() &&
          event.getContent()?.project_task_id === draft.id,
      );
    if (alreadySent) {
      await onSent(draft.id);
      continue;
    }
    const content = projectInstruction(projectId, projectName, draft);
    if (
      !validateInstruction(
        { roomId: targetRoomId, sender: client.getUserId(), content },
        {
          roomId: targetRoomId,
          members: room.getJoinedMembers().map((member: any) => member.userId),
          role: role(client.getUserId()),
          power:
            room.currentState.getMember(client.getUserId())?.powerLevel || 0,
        },
      )
    )
      throw new Error(
        "Une attribution ou un droit est invalide. Les tâches restantes ne sont pas envoyées.",
      );
    await send("bf.fasoconnect.instruction", content, targetRoomId);
    await onSent(draft.id);
  }
}
function showAgenda(proposal?: ProjectPlan) {
  closePanel();
  disposeAIChat?.();
  disposeAIChat = undefined;
  ++roomOpenGeneration;
  activeVoiceRecorder?.dispose();
  activeVoiceRecorder = undefined;
  roomId = "";
  reply = null;
  controls.clear();
  aiChatOpen = false;
  root.classList.add("room-open");
  const chat = $("chat");
  chat.classList.remove("empty-chat", "ai-chatbox-host");
  rooms();
  return openAgenda({
    container: chat,
    userId: client.getUserId(),
    onAskAI: (task) => showAssistant(task),
    onBack: () => root.classList.remove("room-open"),
    onStartProject: showAIChatbox,
    onReviewProject: (saved) => showAgenda(saved),
    proposal,
    delegationRooms: delegationRooms(),
    onPublish: publishProjectDelegations,
  });
}
function showAIChatbox() {
  closePanel();
  disposeAIChat?.();
  ++roomOpenGeneration;
  activeVoiceRecorder?.dispose();
  activeVoiceRecorder = undefined;
  roomId = "";
  reply = null;
  controls.clear();
  aiChatOpen = true;
  root.classList.add("room-open");
  const chat = $("chat");
  chat.classList.remove("empty-chat", "agenda-host");
  rooms();
  const userId = client.getUserId();
  disposeAIChat = openAIChatbox({
    container: chat,
    token: client.getAccessToken(),
    history: aiChatHistory,
    onHistory: (turns) => {
      aiChatHistory = turns;
    },
    onAgenda: () => showAgenda(),
    onPlan: (plan) => showAgenda(plan),
    onBack: () => root.classList.remove("room-open"),
    locked: () =>
      !sessionStorage.getItem("faso_session") ||
      client?.getUserId() !== userId ||
      !client?.getAccessToken() ||
      !aiChatOpen,
  });
}
function showNotificationSettings() {
  notifications?.openSettings();
}
function showAppTour() {
  if (!sessionStorage.getItem("faso_session")) return;
  showWelcomeTour({ userId: client.getUserId(), panel, close: closePanel });
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
  notifications?.dispose();
  notifications = undefined;
  disposeAIChat?.();
  disposeAIChat = undefined;
  aiChatHistory = [];
  aiChatOpen = false;
  activeVoiceRecorder?.dispose();
  activeVoiceRecorder = undefined;
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
  const profileIdentity = node("div", undefined, "profile-identity");
  const profileRole = role(client.getUserId());
  profileIdentity.append(
    node("div", displayName(client.getUserId()), "profile-name"),
    node(
      "small",
      profileRole === "administrateur"
        ? "Administrateur"
        : profileRole === "responsable"
          ? "Responsable"
          : "Agent",
      "profile-role",
    ),
  );
  profile.append(
    node(
      "span",
      displayName(client.getUserId()).slice(0, 1).toUpperCase(),
      "avatar",
    ),
    profileIdentity,
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
    iconButton(
      "Nouveau message",
      "add",
      () => createRoom(),
      "primary new-conversation",
    ),
  );
  const assistantCard = node("section", undefined, "assistant-card");
  const myRole = role(client.getUserId());
  const roleName =
    myRole === "responsable"
      ? "responsable"
      : myRole === "administrateur"
        ? "administrateur"
        : "agent";
  assistantCard.append(
    node("span", "✦ VOTRE ESPACE IA", "assistant-card-eyebrow"),
    node("h3", "Mon assistant de travail"),
    node(
      "p",
      `Des aides adaptées à votre profil ${roleName} pour rédiger, résumer et organiser.`,
    ),
    iconButton(
      "Ouvrir mon assistant",
      "sparkle",
      showAIChatbox,
      "assistant-entry",
    ),
  );
  list.append(assistantCard);
  if (invites.length)
    list.append(
      iconButton(
        "Invitations reçues · " + invites.length,
        "bell",
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
  tools.append(iconButton("Annuaire des collègues", "users", showDirectory));
  tools.append(iconButton("Mon agenda et mes tâches", "calendar", showAgenda));
  const more = node("details", undefined, "more-tools") as HTMLDetailsElement;
  more.open = Boolean(spaceOpen);
  const moreSummary = node("summary", "Mon espace");
  moreSummary.prepend(icon("shield"));
  more.append(
    moreSummary,
    iconButton("Notifications", "bell", showNotificationSettings),
    iconButton("Découvrir l’application", "sparkle", showAppTour),
    iconButton("Appareils et clés", "devices", showDevices),
    iconButton("Installer l’application", "install", installHelp),
    iconButton("Déconnexion", "logout", async () => {
      await client.logout();
      await failLocked();
    }),
  );
  if (role(client.getUserId()) === "administrateur")
    more.append(
      iconButton("Administration", "shield", () => {
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
function callRoomPeer(targetRoomId = roomId) {
  const room = client.getRoom(targetRoomId);
  const peer =
    directCallPeer(room, client.getUserId()) ||
    room
      ?.getJoinedMembers?.()
      ?.find((member: any) => member.userId !== client.getUserId())?.userId;
  if (!peer)
    throw new Error(
      "Ajoutez au moins un collègue avant de démarrer l’appel.",
    );
  return { room, peer };
}
function callVideo(stream: MediaStream, label: string, muted: boolean) {
  const video = node("video") as HTMLVideoElement;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = muted;
  video.srcObject = stream;
  video.setAttribute("aria-label", label);
  return video;
}
function renderCallChat(container: HTMLElement) {
  const room = client.getRoom(roomId);
  const events = room?.getLiveTimeline().getEvents() || [];
  container.replaceChildren();
  for (const event of events.slice(-30)) {
    if (
      event.getType() !== "m.room.message" ||
      event.isDecryptionFailure() ||
      event.getContent()?.msgtype !== "m.text"
    )
      continue;
    const row = node(
      "p",
      `${displayName(event.getSender())} : ${event.getContent().body}`,
    );
    container.append(row);
  }
  container.scrollTop = container.scrollHeight;
}
function toggleCallNotes() {
  const call = activeCall;
  if (!call) return;
  if (call.noting) {
    call.recognition?.stop();
    call.noting = false;
    status("Prise de notes arrêtée.");
    return;
  }
  const Recognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  if (!Recognition)
    throw new Error(
      "La dictée de notes n’est pas disponible dans ce navigateur.",
    );
  const recognition = new Recognition();
  recognition.lang = "fr-FR";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (event: any) => {
    for (let index = event.resultIndex; index < event.results.length; index++)
      if (event.results[index].isFinal)
        call.notes += " " + event.results[index][0].transcript.trim();
  };
  recognition.onerror = () => {
    call.noting = false;
    status("La prise de notes a rencontré une erreur.");
  };
  recognition.onend = () => {
    if (call.noting) recognition.start();
  };
  call.recognition = recognition;
  call.noting = true;
  recognition.start();
  status("Prise de notes IA activée. Parlez clairement en français.");
}
function inviteCallParticipant() {
  const room = client.getRoom(roomId);
  if (!room || !canInvite(room))
    throw new Error("Vous n’avez pas le droit d’ajouter un collègue à cet appel.");
  const current = room
    .getMembers()
    .filter((member: any) => ["join", "invite"].includes(member.membership))
    .map((member: any) => member.userId.split(":")[0].slice(1));
  const p = panel("Ajouter un collègue à la conversation");
  p.append(
    node(
      "p",
      "Le collègue recevra une invitation chiffrée et pourra rejoindre l’appel vidéo en cours après avoir accepté.",
    ),
  );
  contactPicker(
    p,
    async (ids) => {
      for (const id of ids) {
        const userId = "@" + id + ":" + location.hostname;
        await client.invite(room.roomId, userId);
        if (activeCall)
          await sendCallSignal(room.roomId, {
            call_id: activeCall.id,
            action: "invite",
            media: activeCall.media,
            target: userId,
          });
      }
      closePanel();
      status("Invitation envoyée. La conversation peut maintenant accueillir ce collègue.");
      rooms();
    },
    false,
    current,
  );
}
function openCallReport(notes: string) {
  const text = notes.trim();
  if (!text) {
    status("Aucune note capturée pour créer le compte rendu.");
    return;
  }
  void openAssistant({
    token: client.getAccessToken(),
    roomId,
    context: [{ text }],
    panel,
    locked: () =>
      !sessionStorage.getItem("faso_session") ||
      !client?.getAccessToken() ||
      !roomId,
    insertDraft: (answer) => {
      const draft = document.getElementById("message-draft") as HTMLTextAreaElement;
      if (!draft || draft.disabled) throw new Error("Ouvrez une conversation active.");
      draft.value = answer;
      draft.dispatchEvent(new Event("input", { bubbles: true }));
      draft.focus();
    },
  });
}
function callPanel(
  media: "audio" | "video",
  title: string,
  local: MediaStream,
  remote: MediaStream,
  onEnd: () => void,
) {
  const p = panel(title);
  p.classList.add("call-panel");
  const callTop = node("div", undefined, "call-top");
  const callIdentity = node("div", undefined, "call-identity");
  callIdentity.append(
    node("span", media === "video" ? "APPEL VIDÉO" : "APPEL AUDIO", "call-eyebrow"),
    node("strong", "Conversation sécurisée", "call-title"),
  );
  const callLive = node("span", "● En direct", "call-live");
  callTop.append(callIdentity, callLive);
  const videos = node("div", undefined, "call-videos");
  const localVideo = callVideo(local, "Votre caméra", true);
  const remoteVideo = callVideo(remote, "Caméra du collègue", false);
  remoteVideo.hidden = media === "audio";
  localVideo.hidden = media === "audio";
  const remoteTile = node("div", undefined, "call-tile call-tile-remote");
  const localTile = node("div", undefined, "call-tile call-tile-local");
  remoteTile.append(remoteVideo, node("span", "Collègue", "call-tile-label"));
  localTile.append(localVideo, node("span", "Vous", "call-tile-label"));
  const screenBadge = node("span", "Écran partagé", "screen-badge");
  screenBadge.hidden = true;
  localTile.append(screenBadge);
  videos.append(remoteTile, localTile);
  p.append(
    callTop,
    videos,
    node(
      "p",
      media === "video"
        ? "Appel vidéo chiffré de bout en bout"
        : "Appel audio chiffré de bout en bout",
      "call-status",
    ),
  );
  const tools = node("div", undefined, "call-tools");
  const screen = button("Partager l’écran", async () => {
    if (!activeCall) return;
    if (activeCall.screen) {
      const sender = activeCall.pc
        .getSenders()
        .find((item) => item.track?.kind === "video");
      sender?.replaceTrack(activeCall.local.getVideoTracks()[0] || null);
      activeCall.screen.getTracks().forEach((track) => track.stop());
      activeCall.screen = undefined;
      screen.textContent = "Partager l’écran";
      localVideo.srcObject = activeCall.local;
      screenBadge.hidden = true;
      p.classList.remove("screen-sharing");
      return;
    }
    if (!navigator.mediaDevices.getDisplayMedia)
      throw new Error("Le partage d’écran n’est pas disponible dans ce navigateur.");
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    const sender = activeCall.pc
      .getSenders()
      .find((item) => item.track?.kind === "video");
    if (!sender) {
      track.stop();
      throw new Error("Le partage d’écran nécessite un appel vidéo.");
    }
    await sender.replaceTrack(track);
    activeCall.screen = stream;
    screen.textContent = "Arrêter le partage";
    localVideo.srcObject = stream;
    screenBadge.hidden = false;
    p.classList.add("screen-sharing");
    track.onended = () => {
      if (activeCall?.screen === stream) {
        void sender.replaceTrack(activeCall.local.getVideoTracks()[0] || null);
        activeCall.screen = undefined;
        screen.textContent = "Partager l’écran";
        localVideo.srcObject = activeCall.local;
        screenBadge.hidden = true;
        p.classList.remove("screen-sharing");
      }
    };
  });
  screen.disabled = media !== "video";
  const note = button("Activer la prise de notes", () => toggleCallNotes());
  const colleague = button("Ajouter un collègue", () => inviteCallParticipant());
  tools.append(screen, note, colleague);
  const chat = node("section", undefined, "call-chat");
  chat.append(node("strong", "Chat de l’appel"));
  const chatLog = node("div", undefined, "call-chat-log");
  const chatForm = node("form", undefined, "call-chat-form") as HTMLFormElement;
  const chatInput = node("input") as HTMLInputElement;
  chatInput.placeholder = "Écrire dans le chat…";
  chatInput.maxLength = 2000;
  chatInput.setAttribute("aria-label", "Message du chat de l’appel");
  const chatSend = button("Envoyer", async () => {});
  chatSend.type = "submit";
  chatForm.append(chatInput, chatSend);
  chatForm.onsubmit = async (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    await send("m.room.message", { msgtype: "m.text", body: text }, roomId);
    chatInput.value = "";
    renderCallChat(chatLog);
  };
  chat.append(chatLog, chatForm);
  renderCallChat(chatLog);
  p.append(tools, chat, button("Raccrocher", onEnd, "danger"));
  return { dialog: p, localVideo, remoteVideo };
}
async function sendCallSignal(
  targetRoomId: string,
  signal: Record<string, unknown>,
) {
  await send(CALL_EVENT, signal, targetRoomId);
}
function queueCallSignal(signal: any) {
  const list = pendingCallSignals.get(signal.call_id) || [];
  list.push(signal);
  pendingCallSignals.set(signal.call_id, list.slice(-10));
}
async function applyCallSignal(
  signal: any,
  peerConnection = activeCall?.pc,
  peer?: string,
) {
  if (!activeCall || activeCall.id !== signal.call_id) {
    queueCallSignal(signal);
    return;
  }
  if (!peerConnection) return;
  if (signal.action === "answer") {
    await peerConnection.setRemoteDescription(signal.description);
  } else if (signal.action === "offer") {
    await peerConnection.setRemoteDescription(signal.description);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await sendCallSignal(roomId, {
      call_id: activeCall.id,
      action: "answer",
      media: activeCall.media,
      target: peer,
      description: peerConnection.localDescription,
    });
  } else if (signal.action === "ice") {
    await peerConnection.addIceCandidate(signal.candidate);
  }
}
async function createCall(
  targetRoomId: string,
  peer: string,
  id: string,
  media: "audio" | "video",
) {
  if (activeCall) throw new Error("Un autre appel est déjà en cours.");
  const local = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: media === "video",
  });
  const remote = new MediaStream();
  const pc = new RTCPeerConnection({ iceServers: [] });
  for (const track of local.getTracks()) pc.addTrack(track, local);
  const ui = callPanel(
    media,
    media === "video" ? "Appel vidéo" : "Appel audio",
    local,
    remote,
    () => void endCall(),
  );
  activeCall = {
    id,
    media,
    peer,
    pc,
    peers: new Map([[peer, pc]]),
    local,
    remote,
    dialog: ui.dialog,
    localVideo: ui.localVideo,
    remoteVideo: ui.remoteVideo,
    notes: "",
    noting: false,
  };
  pc.ontrack = (event) => {
    for (const track of event.streams[0]?.getTracks() || [])
      if (!remote.getTracks().some((current) => current.id === track.id))
        remote.addTrack(track);
  };
  pc.onicecandidate = (event) => {
    if (event.candidate)
      void sendCallSignal(targetRoomId, {
        call_id: id,
        action: "ice",
        media,
        candidate: event.candidate.toJSON(),
      }).catch((error) => status(humanError(error)));
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState))
      void endCall(false);
  };
  for (const signal of pendingCallSignals.get(id) || [])
    await applyCallSignal(signal);
  pendingCallSignals.delete(id);
  return activeCall;
}
async function addCallPeer(peer: string, offer = false) {
  const call = activeCall;
  if (!call || call.peers.has(peer)) return call?.peers.get(peer);
  if (call.peers.size >= 6)
    throw new Error("Cet appel est limité à 7 participants.");
  const pc = new RTCPeerConnection({ iceServers: [] });
  for (const track of call.local.getTracks()) pc.addTrack(track, call.local);
  pc.ontrack = (event) => {
    for (const track of event.streams[0]?.getTracks() || [])
      if (!call.remote.getTracks().some((current) => current.id === track.id))
        call.remote.addTrack(track);
  };
  pc.onicecandidate = (event) => {
    if (event.candidate)
      void sendCallSignal(roomId, {
        call_id: call.id,
        action: "ice",
        media: call.media,
        target: peer,
        candidate: event.candidate.toJSON(),
      }).catch((error) => status(humanError(error)));
  };
  call.peers.set(peer, pc);
  if (offer) {
    const description = await pc.createOffer();
    await pc.setLocalDescription(description);
    await sendCallSignal(roomId, {
      call_id: call.id,
      action: "offer",
      media: call.media,
      target: peer,
      description: pc.localDescription,
    });
  }
  return pc;
}
async function startCall(media: "audio" | "video") {
  const { peer } = callRoomPeer();
  const id = newCallId();
  const call = await createCall(roomId, peer, id, media);
  await sendCallSignal(roomId, { call_id: id, action: "invite", media });
  const offer = await call.pc.createOffer();
  await call.pc.setLocalDescription(offer);
  await sendCallSignal(roomId, {
    call_id: id,
    action: "offer",
    media,
    description: call.pc.localDescription,
  });
  status("Appel en cours…");
}
async function acceptIncomingCall(signal: any, sender: string) {
  const peer = sender;
  if (activeCall) {
    await addCallPeer(peer, true);
    return;
  }
  const call = await createCall(roomId, peer, signal.call_id, signal.media);
  const offer = await call.pc.createOffer();
  await call.pc.setLocalDescription(offer);
  await sendCallSignal(roomId, {
    call_id: call.id,
    action: "offer",
    media: call.media,
    target: peer,
    description: call.pc.localDescription,
  });
  status("Connexion à l’appel…");
}
async function endCall(notify = true) {
  const call = activeCall;
  activeCall = undefined;
  if (!call) return;
  const notes = call.notes;
  call.noting = false;
  call.recognition?.stop();
  call.screen?.getTracks().forEach((track) => track.stop());
  if (notify)
    await sendCallSignal(roomId, {
      call_id: call.id,
      action: "hangup",
      media: call.media,
    }).catch((error) => status(humanError(error)));
  for (const peer of call.peers.values()) peer.close();
  for (const track of call.local.getTracks()) track.stop();
  call.dialog.remove();
  closePanel();
  status("Appel terminé.");
  if (notes.trim()) openCallReport(notes);
}
function showIncomingCall(signal: any, sender: string) {
  const p = panel(signal.media === "video" ? "Appel vidéo entrant" : "Appel audio entrant");
  p.classList.add("incoming-call-panel");
  p.append(
    node("p", `${displayName(sender)} vous appelle.`, "call-status"),
    button("Répondre", async () => {
      closePanel();
      await acceptIncomingCall(signal, sender);
    }, "primary"),
    button("Refuser", async () => {
      closePanel();
      await sendCallSignal(roomId, {
        call_id: signal.call_id,
        action: "hangup",
        media: signal.media,
      });
    }),
  );
}
async function handleCallEvent(event: any, room: any) {
  if (
    event.getType() !== CALL_EVENT ||
    event.isState() ||
    event.isDecryptionFailure() ||
    event.getRoomId() !== roomId
  )
    return;
  const signal = event.getContent();
  if (
    !validateCallSignal(signal) ||
    (signal.target && signal.target !== client.getUserId()) ||
    event.getSender() === client.getUserId()
  )
    return;
  const sender = event.getSender();
  if (signal.action === "invite") {
    if (activeCall) {
      if (signal.call_id === activeCall.id)
        await addCallPeer(event.getSender(), true);
      return;
    }
    showIncomingCall(signal, sender);
    return;
  }
  if (signal.action === "hangup") {
    if (activeCall?.id === signal.call_id) await endCall(false);
    else pendingCallSignals.delete(signal.call_id);
    return;
  }
  if (!activeCall || activeCall.id !== signal.call_id) {
    queueCallSignal(signal);
    return;
  }
  const peerConnection =
    activeCall.peers.get(sender) || (await addCallPeer(sender, false));
  await applyCallSignal(signal, peerConnection, sender);
}
let roomOpenGeneration = 0;
async function openRoom(id: string) {
  const generation = ++roomOpenGeneration;
  const room = await waitForSyncedRoom(client, id);
  if (generation !== roomOpenGeneration) return;
  closePanel();
  disposeAIChat?.();
  disposeAIChat = undefined;
  aiChatOpen = false;
  await endCall(false);
  const discardedVoice = activeVoiceRecorder?.dispose();
  activeVoiceRecorder = undefined;
  if (discardedVoice)
    status("Vocal non envoyé supprimé en changeant de conversation.");
  root.classList.add("room-open");
  $("chat").classList.remove("empty-chat", "agenda-host", "ai-chatbox-host");
  roomId = id;
  reply = null;
  query = "";
  controls.clear();
  rooms();
  const chat = $("chat");
  const heading = node("div", undefined, "chat-header"),
    title = node("div", undefined, "chat-heading");
  const back = iconButton(
    "Retour",
    "back",
    () => root.classList.remove("room-open"),
    "back-to-list",
  );
  back.setAttribute("aria-label", "Revenir aux conversations");
  title.append(
    node("h1", roomTitle(room)),
    node("div", "Messages privés et protégés", "meta"),
  );
  const actions = node("div", undefined, "actions chat-actions");
  const options = iconButton("Options", "more", showChatOptions, "chat-menu");
  options.setAttribute("aria-label", "Options de la conversation");
  actions.append(
    iconButton(
      "Assistant IA",
      "sparkle",
      showAssistant,
      "assistant-chat-action",
    ),
    iconButton("Dossiers", "folder", showDossiers),
    iconButton("Instructions", "checklist", showInstructionBoard),
    iconButton("Participants", "users", showMembers),
    iconButton("Inviter", "invite", showInvite, "invite-action"),
    iconButton("Rechercher", "search", () => {
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
  const peer =
    directCallPeer(room, client.getUserId()) ||
    room.getJoinedMembers().find((member: any) => member.userId !== client.getUserId())
      ?.userId;
  if (peer) {
    const callBar = node("section", undefined, "chat-call-bar");
    callBar.setAttribute("aria-label", "Appels privés");
    const callCopy = node("div", undefined, "chat-call-copy");
    callCopy.append(
      node("strong", "Appeler " + displayName(peer)),
      node("small", "Communication audio ou vidéo chiffrée"),
    );
    const callActions = node("div", undefined, "chat-call-actions");
    const audioCall = iconButton(
      "Appel audio",
      "phone",
      () => startCall("audio"),
      "call-action call-audio",
    );
    const videoCall = iconButton(
      "Appel vidéo",
      "video",
      () => startCall("video"),
      "call-action call-video",
    );
    const callDisabled = archivedRoom(room) || room.getMyMembership() !== "join";
    audioCall.disabled = callDisabled;
    videoCall.disabled = callDisabled;
    callActions.append(audioCall, videoCall);
    callBar.append(callCopy, callActions);
    chat.append(callBar);
  }
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
      updateSendControls();
    }
  };
  const file = node("input") as HTMLInputElement;
  file.type = "file";
  file.id = "attachment-input";
  file.hidden = true;
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
  const attach = node("button", "＋", "attachment-button") as HTMLButtonElement;
  attach.type = "button";
  attach.dataset.sendAction = "true";
  attach.disabled = blocked;
  attach.onclick = () => file.click();
  attach.title = "Joindre un fichier";
  attach.setAttribute("aria-label", "Joindre un fichier");
  attach.replaceChildren(icon("paperclip"));
  compose.prepend(attach);
  const voice = node("button", undefined, "voice-trigger") as HTMLButtonElement;
  voice.type = "button";
  voice.dataset.sendAction = "true";
  voice.disabled = blocked;
  voice.setAttribute("aria-label", "Enregistrer un message vocal");
  voice.title = "Enregistrer un message vocal";
  voice.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></svg>';
  compose.prepend(voice);
  activeVoiceRecorder = createVoiceRecorder({
    composer: compose,
    trigger: voice,
    hideWhileActive: [attach, input, submit],
    refreshControls: updateSendControls,
    report: status,
    upload: async (clip, info) => {
      if (roomId !== id)
        throw new Error(
          "La conversation a changé. Le vocal n'a pas été envoyé.",
        );
      await verifiedRecipients(id);
      const encrypted = await encryptAttachment(await clip.arrayBuffer());
      const uploaded = await client.uploadContent(new Blob([encrypted.data]), {
        type: "application/octet-stream",
        includeFilename: false,
      });
      if (roomId !== id)
        throw new Error(
          "La conversation a changé. Le vocal n'a pas été envoyé.",
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
          file: { ...encrypted.info, url: uploaded.content_uri },
        },
        id,
      );
    },
  });
  voice.onclick = () => void activeVoiceRecorder?.start();
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
  p.classList.add("dossiers-panel");
  p.append(
    node(
      "p",
      "Chaque dossier partage les participants de cette conversation. Sa référence, son titre et ses notes sont chiffrés. Seuls les éléments chargés sur cet appareil sont affichés.",
    ),
  );
  const dossiers = roomDossiers(room);
  const summary = node(
    "p",
    `${dossiers.length} dossier${dossiers.length > 1 ? "s" : ""} chargé${dossiers.length > 1 ? "s" : ""}`,
    "panel-count",
  );
  p.append(summary);
  if (!dossiers.length)
    p.append(
      node(
        "p",
        "Aucun dossier disponible dans les messages chargés.",
        "panel-empty",
      ),
    );
  const list = node("div", undefined, "dossier-list");
  for (const event of dossiers) {
    const content = event.getContent();
    const entry = button("", () => showDossier(event, room), "dossier-entry");
    entry.append(
      node("strong", content.reference),
      node("span", content.title),
      node("small", "Ouvrir le dossier →"),
    );
    list.append(entry);
  }
  p.append(list);
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
  p.classList.add("dossier-panel");
  p.append(
    node("p", c.description || "Aucune description.", "dossier-description"),
  );
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
  for (const note of notes) {
    const card = node("article", undefined, "dossier-note");
    card.append(
      node("strong", displayName(note.getSender())),
      node("p", note.getContent().body),
    );
    p.append(card);
  }
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
      button(
        `↓ ${file.getContent().body || "Document"}`,
        () => download(file.getContent()),
        "dossier-document",
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
      `Travaux validés : ${progress.completed} sur ${progress.items.length}`,
    ),
  );
  const meter = node("progress") as HTMLProgressElement;
  meter.max = Math.max(progress.items.length, 1);
  meter.value = progress.completed;
  meter.setAttribute("aria-label", "Travaux validés");
  section.append(meter);
  if (progress.closed && !opaque)
    section.append(
      node("p", "Tous les travaux ont été validés par le responsable."),
    );
  for (const item of progress.items) {
    const row = node("div", undefined, "instruction-progress-row");
    const heading = node("div", undefined, "progress-row-heading");
    const badge = node("span", WORKFLOW_LABELS[item.status], "progress-badge");
    badge.dataset.state = item.status;
    heading.append(node("strong", displayName(item.recipient)), badge);
    row.append(heading);
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
  p.classList.add("instruction-board-panel");
  p.append(
    node(
      "p",
      "Suivi calculé sur cet appareil à partir des messages chargés et déchiffrés. Les accusés de prise de connaissance restent distincts du travail réalisé.",
    ),
  );
  p.append(button("Actualiser le suivi", showInstructionBoard));
  const records = events.filter((e: any) => validInstruction(e, room));
  p.append(
    node(
      "p",
      `${records.length} instruction${records.length > 1 ? "s" : ""} chargée${records.length > 1 ? "s" : ""}`,
      "panel-count",
    ),
  );
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
      node(
        "p",
        "Aucune instruction disponible dans les messages chargés.",
        "panel-empty",
      ),
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
      const isAudio = c.msgtype === "m.audio" && c.file;
      const seconds = Number(c.info?.duration);
      b.append(
        node(
          "div",
          isAudio
            ? `Message vocal${Number.isFinite(seconds) && seconds > 0 ? ` · ${Math.ceil(seconds / 1000)} s` : ""}`
            : c.body || "Message",
          isAudio ? "voice-message-title" : "",
        ),
      );
      if (c.file && !isAudio)
        b.append(button("Télécharger et déchiffrer", () => download(c)));
      if (isAudio) {
        const play = button("▶ Écouter", async () => {
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
          play.remove();
          setTimeout(() => URL.revokeObjectURL(url), 300000);
          await audio.play().catch(() => {});
        });
        b.append(play);
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
  const p = panel("Reconnaître les appareils");
  p.classList.add("devices-panel");
  p.append(
    node(
      "p",
      "Pour éviter qu’un inconnu se fasse passer pour votre collègue, comparez ensemble le code de sécurité de vos appareils, par téléphone ou en personne.",
    ),
  );
  const steps = node("ol", undefined, "device-steps");
  for (const step of [
    "Ouvrez ci-dessous la carte de l’appareil de votre collègue. Demandez-lui d’ouvrir « Appareils et clés » sur son propre appareil.",
    "Comparez le code de sa carte avec le code « Mon appareil actuel » qu’il voit. Ils doivent être exactement identiques.",
    "Confirmez uniquement après cette comparaison. En cas de doute, contactez votre administrateur.",
  ])
    steps.append(node("li", step));
  p.append(steps);
  const users = roomId
    ? client
        .getRoom(roomId)
        .getJoinedMembers()
        .map((m: any) => m.userId)
    : [client.getUserId()];
  const map = await client.getCrypto().getUserDeviceInfo(users, true);
  const collection = node("div", undefined, "device-list");
  p.append(collection);
  for (const [user, devices] of map) {
    for (const [id, info] of devices) {
      const own = user === client.getUserId() && id === client.getDeviceId();
      const card = node("section", undefined, "device-card");
      card.append(
        node(
          "h3",
          own ? "Mon appareil actuel" : `${displayName(user)} · appareil ${id}`,
        ),
        node(
          "p",
          own
            ? "Communiquez ce code à votre collègue pendant votre échange."
            : "Comparez ce code avec celui que votre collègue voit sur son appareil.",
        ),
      );
      const keys = Object.fromEntries(info.keys) as Record<string, string>;
      const fingerprint = keys[`ed25519:${id}`];
      if (fingerprint)
        card.append(node("code", fingerprint, "device-fingerprint"));
      else
        card.append(
          node("p", "Code de sécurité indisponible pour cet appareil."),
        );
      const advanced = node("details", undefined, "device-advanced");
      advanced.append(
        node("summary", "Détails techniques"),
        node(
          "pre",
          JSON.stringify({ compte: user, appareil: id, cles: keys }, null, 2),
        ),
      );
      card.append(advanced);
      collection.append(card);
      if (own || !fingerprint) {
        continue;
      }
      const verify = button(
        "Codes identiques : confirmer cet appareil",
        async () => {
          if (
            !confirm(
              "Avez-vous comparé les codes directement avec votre collègue ? Confirmez seulement s’ils sont identiques.",
            )
          )
            return;
          await client.getCrypto().setDeviceVerified(user, id, true);
          verify.textContent = "Appareil confirmé";
          verify.disabled = true;
          status("Appareil confirmé après comparaison des codes.");
        },
        "primary",
      );
      card.append(verify);
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
    `<main class="welcome-layout"><section class="welcome-story"><div class="eyebrow">VOTRE ESPACE DE TRAVAIL</div><h1>Les bons échanges.<br><em>En toute confiance.</em></h1><p>Vos collègues, vos conversations et vos idées.<br>Réunis dans un espace simple et protégé.</p><div class="welcome-tags"><span>Messages privés</span><span>Dossiers chiffrés</span><span>Messages vocaux</span><span>Assistant IA local</span></div><div class="conversation-art" aria-hidden="true"><div class="art-top"><span class="art-avatar">A</span><div><b>Votre équipe</b><small>Une conversation qui avance.</small></div><span class="art-dot"></span></div><div class="art-message">Bonjour ! Le document est prêt pour notre réunion.</div><div class="art-message art-own">Parfait, merci. À tout à l’heure !<span>✓✓</span></div><div class="art-footer"><span>✦</span> Un peu d’aide, beaucoup de simplicité.</div></div><small class="welcome-signature">FasoConnect · Pensé pour vos échanges de service.</small></section><section class="login-card"><div class="eyebrow">HEUREUX DE VOUS RETROUVER</div><h2>Bienvenue chez vous.</h2><p>Connectez-vous pour retrouver votre équipe.</p><div id="welcome-action"></div><div class="login-steps"><span><b>1</b> Votre identifiant et votre mot de passe</span><span><b>2</b> Le code à 6 chiffres de votre téléphone</span></div><details class="login-help"><summary>Première connexion ?</summary><p>Votre administrateur vous remet votre accès. Après avoir choisi votre mot de passe, scannez le QR code affiché avec votre application d’authentification. Elle générera vos codes de connexion.</p><p>Un code ne fonctionne pas ? Vérifiez l’heure automatique du téléphone et attendez le code suivant.</p></details><small>Ce navigateur conserve les clés nécessaires à vos échanges. Utilisez votre appareil personnel et verrouillez votre session.</small></section></main>`;
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
    '<div class="shell"><aside id="rooms" aria-label="Conversations et outils"></aside><main class="chat empty-chat" id="chat"><div class="empty-state"><span class="empty-symbol" aria-hidden="true">✦</span><div class="eyebrow">VOTRE ESPACE DE TRAVAIL</div><h1>Vos échanges, au même endroit.</h1><p>Choisissez une conversation ou contactez un collègue pour commencer.</p><div id="empty-actions" class="quick-widgets"></div><small>Messages protégés · Dossiers · Assistant de travail</small></div></main></div>';
  $("empty-actions").append(
    quickWidget("Nouveau message", "Écrire à un collègue", "add", createRoom),
    quickWidget("Annuaire", "Retrouver l’équipe", "users", showDirectory),
    quickWidget(
      "Assistant IA",
      "Préparer votre travail",
      "sparkle",
      showAIChatbox,
    ),
    quickWidget("Mon agenda", "Gérer mes tâches", "calendar", showAgenda),
  );
  notifications = createNotificationCenter({
    userId: s.user_id,
    panel,
    getRooms: () => client.getRooms(),
    getRoom: (id) => client.getRoom(id),
    active: () =>
      Boolean(
        sessionStorage.getItem("faso_session") && client?.getAccessToken(),
      ),
    onOpenRoom: (id) => {
      void openRoom(id).catch((error) => status(humanError(error)));
    },
    onInvitations: showInvitations,
    onAgenda: () => showAgenda(),
  });
  client.on("sync", (state: string, prev: string, data: any) => {
    status(
      state === "ERROR"
        ? "Connexion interrompue. Reconnexion en cours…"
        : navigator.onLine
          ? "Connecté · Vos échanges sont protégés"
          : "Hors ligne · Aucun envoi en clair conservé sur disque",
    );
    if (data?.error?.httpStatus === 401) {
      void failLocked();
      return;
    }
    notifications?.sync(state);
    rooms();
    if (
      state === "PREPARED" &&
      !tourShownThisSession &&
      !welcomeTourSeen(s.user_id)
    ) {
      tourShownThisSession = true;
      queueMicrotask(showAppTour);
    }
  });
  client.on(
    "Room.timeline",
    (event: any, room: any, toStartOfTimeline: boolean) => {
      notifications?.timeline(event, room, toStartOfTimeline);
      if (activeCall && event.getRoomId() === roomId) {
        const callChat = document.querySelector<HTMLElement>(".call-chat-log");
        if (callChat) renderCallChat(callChat);
      }
      void handleCallEvent(event, room).catch((error) =>
        status(humanError(error)),
      );
      if (
        event.getType() === "m.room.tombstone" &&
        event.getRoomId() === roomId
      ) {
        reply = null;
        openRoom(roomId);
      } else renderMessages();
    },
  );
  client.on("Event.decrypted", (event: any) => {
    notifications?.decrypted(event);
    renderMessages();
  });
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
