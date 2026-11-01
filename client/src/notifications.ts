import { loadPersonalTasks } from "./personal-tasks";
import { dueToday, notificationKind } from "./notification-logic.js";

type Settings = {
  enabled: boolean;
  messages: boolean;
  invitations: boolean;
  instructions: boolean;
  tasks: boolean;
  onlyWhenHidden: boolean;
  tasksTime: string;
};
const DEFAULTS: Settings = {
  enabled: false,
  messages: true,
  invitations: true,
  instructions: true,
  tasks: false,
  onlyWhenHidden: true,
  tasksTime: "09:00",
};
const keyFor = (userId: string) => `faso-notifications-v1:${userId}`;
const reminderKeyFor = (userId: string) => `faso-task-reminder-v1:${userId}`;

function loadSettings(userId: string): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(keyFor(userId)) || "{}");
    const result = { ...DEFAULTS };
    for (const field of [
      "enabled",
      "messages",
      "invitations",
      "instructions",
      "tasks",
      "onlyWhenHidden",
    ] as const)
      if (typeof stored[field] === "boolean") result[field] = stored[field];
    if (
      typeof stored.tasksTime === "string" &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(stored.tasksTime)
    )
      result.tasksTime = stored.tasksTime;
    return result;
  } catch {
    return { ...DEFAULTS };
  }
}

export function createNotificationCenter(options: {
  userId: string;
  panel: (title: string) => HTMLElement;
  getRooms: () => any[];
  getRoom: (id: string) => any;
  active: () => boolean;
  onOpenRoom: (id: string) => void;
  onInvitations: () => void;
  onAgenda: () => void;
}) {
  let settings = loadSettings(options.userId);
  let ready = false;
  let disposed = false;
  let checkingTasks = false;
  let lastReminder = "";
  const knownInvites = new Set<string>();
  const seenEvents = new Set<string>();
  const permission = () =>
    typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission;
  const save = () => {
    try {
      localStorage.setItem(keyFor(options.userId), JSON.stringify(settings));
      return true;
    } catch {
      return false;
    }
  };
  const show = (
    kind: "messages" | "invitations" | "instructions" | "tasks",
    roomId?: string,
  ) => {
    if (
      disposed ||
      !options.active() ||
      !settings.enabled ||
      !settings[kind] ||
      permission() !== "granted" ||
      (settings.onlyWhenHidden && !document.hidden)
    )
      return false;
    const bodies = {
      messages: "Nouveau message protégé",
      invitations: "Nouvelle invitation à une conversation",
      instructions: "Nouvelle instruction de service",
      tasks: "Une tâche est prévue aujourd’hui",
    };
    try {
      const notification = new Notification("FasoConnect", {
        body: bodies[kind],
        tag: `faso-${kind}-${roomId || "agenda"}`,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
        if (kind === "tasks") options.onAgenda();
        else if (kind === "invitations") options.onInvitations();
        else if (roomId) options.onOpenRoom(roomId);
      };
      return true;
    } catch {
      return false;
    }
  };
  const baseline = () => {
    for (const room of options.getRooms()) {
      if (room.getMyMembership?.() === "invite") knownInvites.add(room.roomId);
      for (const event of room.getLiveTimeline?.().getEvents?.() || []) {
        const id = event.getId?.();
        if (id) seenEvents.add(id);
      }
    }
    ready = true;
  };
  const handleEvent = (event: any, room: any, toStart = false) => {
    if (
      !ready ||
      disposed ||
      toStart ||
      !room ||
      room.getMyMembership?.() !== "join"
    )
      return;
    const id = event.getId?.();
    if (!id || seenEvents.has(id)) return;
    const kind = notificationKind(event, options.userId);
    if (!kind) return;
    seenEvents.add(id);
    if (seenEvents.size > 500)
      seenEvents.delete(seenEvents.values().next().value!);
    const timestamp = event.getTs?.();
    if (
      typeof timestamp !== "number" ||
      Date.now() - timestamp > 120000 ||
      timestamp > Date.now() + 30000
    )
      return;
    show(kind, room.roomId);
  };
  const sync = (state: string) => {
    if (disposed) return;
    if (!ready) {
      if (state === "PREPARED") baseline();
      return;
    }
    for (const room of options.getRooms()) {
      if (
        room.getMyMembership?.() !== "invite" ||
        knownInvites.has(room.roomId)
      )
        continue;
      knownInvites.add(room.roomId);
      show("invitations", room.roomId);
    }
  };
  const checkTasks = async () => {
    if (
      checkingTasks ||
      disposed ||
      !ready ||
      !options.active() ||
      !settings.enabled ||
      !settings.tasks ||
      permission() !== "granted"
    )
      return;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (
      now.toTimeString().slice(0, 5) < settings.tasksTime ||
      lastReminder === day
    )
      return;
    try {
      if (localStorage.getItem(reminderKeyFor(options.userId)) === day) return;
    } catch {
      /* mémoire seulement */
    }
    checkingTasks = true;
    try {
      const tasks = await loadPersonalTasks(options.userId);
      if (!dueToday(tasks, now)) return;
      if (show("tasks")) {
        lastReminder = day;
        try {
          localStorage.setItem(reminderKeyFor(options.userId), day);
        } catch {
          /* mémoire seulement */
        }
      }
    } catch {
      /* Un stockage indisponible ne bloque pas la messagerie. */
    } finally {
      checkingTasks = false;
    }
  };
  const timer = window.setInterval(checkTasks, 60000);
  const onVisibility = () => {
    void checkTasks();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const openSettings = () => {
    const p = options.panel("Notifications");
    p.classList.add("notifications-panel");
    const create = <T extends keyof HTMLElementTagNameMap>(
      tag: T,
      text?: string,
    ) => {
      const element = document.createElement(tag);
      if (text) element.textContent = text;
      return element;
    };
    p.append(
      create(
        "p",
        "Choisissez vos alertes. Elles fonctionnent pendant que FasoConnect est ouvert sur cet appareil. Aucun texte de message, nom de tâche ou contenu de dossier n’apparaît dans les notifications.",
      ),
    );
    const state = create("p");
    state.setAttribute("role", "status");
    const status = () => {
      const value = permission();
      state.textContent =
        value === "granted"
          ? "Autorisation du navigateur accordée."
          : value === "denied"
            ? "Notifications bloquées dans le navigateur. Autorisez FasoConnect dans ses paramètres."
            : value === "unsupported"
              ? "Ce navigateur ne prend pas en charge les notifications."
              : "Autorisation du navigateur à demander lors de l’activation.";
    };
    const row = (label: string, field: keyof Settings) => {
      const wrapper = create("label"),
        input = create("input");
      input.type = "checkbox";
      input.checked = Boolean(settings[field]);
      wrapper.className = "notification-choice";
      wrapper.append(input, create("span", label));
      input.onchange = async () => {
        if (
          field === "enabled" &&
          input.checked &&
          permission() !== "granted"
        ) {
          const result =
            typeof Notification === "undefined"
              ? "unsupported"
              : await Notification.requestPermission();
          if (result !== "granted") {
            input.checked = false;
            status();
            return;
          }
        }
        (settings[field] as boolean) = input.checked;
        if (!save())
          state.textContent = "Préférences non enregistrées sur cet appareil.";
        else status();
        void checkTasks();
      };
      p.append(wrapper);
    };
    row("Activer les notifications du navigateur", "enabled");
    row("Nouveaux messages protégés", "messages");
    row("Invitations reçues", "invitations");
    row("Instructions de service", "instructions");
    row("Rappel des tâches prévues aujourd’hui", "tasks");
    row(
      "Afficher seulement quand l’application est en arrière-plan",
      "onlyWhenHidden",
    );
    const timeLabel = create("label", "Heure du rappel des tâches"),
      time = create("input");
    time.type = "time";
    time.value = settings.tasksTime;
    timeLabel.className = "notification-time";
    timeLabel.append(time);
    time.onchange = () => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.value)) return;
      settings.tasksTime = time.value;
      if (!save())
        state.textContent = "Préférences non enregistrées sur cet appareil.";
      else status();
    };
    p.append(timeLabel, state);
    status();
    return p;
  };
  return {
    openSettings,
    sync,
    timeline: handleEvent,
    decrypted: (event: any) =>
      handleEvent(event, options.getRoom(event.getRoomId?.())),
    dispose: () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
