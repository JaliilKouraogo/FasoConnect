export type AIChatTurn = { role: "user" | "assistant"; text: string };
import { prepareChatAttachment, type ChatAttachment } from "./chat-attachments";
import type { ProjectPlan } from "./project-plan";

const make = <T extends keyof HTMLElementTagNameMap>(
  tag: T,
  text?: string,
  cls?: string,
) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (cls) element.className = cls;
  return element;
};

const icon = (paths: string) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = paths;
  return svg;
};

const SUGGESTIONS: Record<string, string[]> = {
  agent: [
    "Je veux organiser un projet. Aide-moi à préciser les objectifs, les tâches et les personnes concernées.",
    "Aide-moi à organiser ma journée. Pose-moi les questions nécessaires.",
    "Aide-moi à rédiger une réponse professionnelle.",
    "Explique-moi comment fonctionne FasoConnect.",
  ],
  responsable: [
    "Je veux organiser un projet et déléguer des tâches. Pose-moi les questions utiles avant de préparer le plan.",
    "Aide-moi à préparer une instruction claire.",
    "Aide-moi à organiser les priorités de mon équipe.",
    "Pose-moi les questions nécessaires pour préparer une réunion.",
  ],
  administrateur: [
    "Aide-moi à structurer un projet de service en groupes de tâches et responsables.",
    "Explique-moi comment vérifier un appareil.",
    "Aide-moi à préparer une note de service.",
    "Quelles étapes suivre pour un accès perdu ?",
  ],
};

export function openAIChatbox(options: {
  container: HTMLElement;
  token: string;
  history: AIChatTurn[];
  onHistory: (turns: AIChatTurn[]) => void;
  onAgenda: () => void;
  onPlan: (plan: ProjectPlan) => void;
  onBack: () => void;
  locked: () => boolean;
}) {
  const lifecycle = new AbortController();
  let active: AbortController | null = null;
  let ready = false;
  let history = options.history;
  let pending = "";
  let generation = 0;
  let preparing = false;
  const attachments: { item: ChatAttachment; preview?: string }[] = [];
  const view = make("section", undefined, "ai-chatbox");
  view.setAttribute("aria-label", "Dialogue avec mon assistant IA");
  const header = make("header", undefined, "ai-chatbox-header");
  const back = make("button", "←", "ai-chatbox-back");
  back.setAttribute("aria-label", "Revenir aux conversations");
  back.onclick = options.onBack;
  const badge = make("span", "✦", "ai-chatbox-badge");
  badge.setAttribute("aria-hidden", "true");
  const title = make("div", undefined, "ai-chatbox-title");
  title.append(
    make("h1", "Mon assistant IA"),
    make("small", "Dialogue privé avec le modèle local"),
  );
  const clear = make("button", "Effacer le dialogue", "ai-chatbox-clear");
  clear.onclick = () => {
    generation++;
    active?.abort();
    history = [];
    pending = "";
    clearAttachments();
    options.onHistory([]);
    render();
    state.textContent = "Dialogue effacé de cette session.";
  };
  header.append(back, badge, title, clear);
  const thread = make("div", undefined, "ai-chatbox-thread");
  thread.setAttribute("role", "log");
  thread.setAttribute("aria-live", "polite");
  const footer = make("div", undefined, "ai-chatbox-footer");
  const profile = make(
    "p",
    "Chargement de votre profil…",
    "ai-chatbox-profile",
  );
  const suggestions = make("div", undefined, "ai-chatbox-suggestions");
  const state = make("p", "Vérification de l’IA locale…", "ai-chatbox-state");
  state.setAttribute("role", "status");
  const form = make("form", undefined, "ai-chatbox-form");
  const composer = make("div", undefined, "ai-chatbox-composer");
  const composerActions = make("div", undefined, "ai-chatbox-composer-actions");
  const attachmentList = make("div", undefined, "ai-chatbox-attachments");
  const fileInput = make("input");
  fileInput.type = "file";
  fileInput.hidden = true;
  fileInput.multiple = true;
  fileInput.accept = ".pdf,.txt,.md,.csv,.json,image/jpeg,image/png,image/webp";
  fileInput.setAttribute(
    "aria-label",
    "Choisir des fichiers ou des images pour l’IA",
  );
  const attach = make("button", undefined, "ai-chatbox-attach");
  attach.type = "button";
  attach.setAttribute("aria-label", "Joindre un fichier ou une image");
  attach.title = "Joindre un fichier ou une image";
  attach.append(
    icon('<path d="m9 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8"/>'),
  );
  attach.onclick = () => fileInput.click();
  const prompt = make("textarea");
  prompt.rows = 2;
  prompt.maxLength = 2000;
  prompt.placeholder = "Écrivez à votre assistant…";
  prompt.setAttribute("aria-label", "Votre message à l’assistant IA");
  const send = make("button", undefined, "primary ai-chatbox-send");
  send.type = "submit";
  send.setAttribute("aria-label", "Envoyer à l’assistant IA");
  send.title = "Envoyer à l’assistant IA";
  send.append(icon('<path d="m3 20 18-8L3 4l3 7 9 1-9 1-3 7Z"/>'));
  send.disabled = true;
  const plan = make("button", "Organiser en projet", "ai-project-action");
  plan.type = "button";
  plan.disabled = true;
  plan.prepend(
    icon(
      '<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/>',
    ),
  );
  const cancel = make("button", "Annuler");
  cancel.type = "button";
  cancel.hidden = true;
  cancel.onclick = () => active?.abort();
  composer.append(attach, prompt, send);
  composerActions.append(plan, cancel);
  form.append(fileInput, composer, composerActions);
  const actions = make("div", undefined, "ai-chatbox-links");
  const attachmentHint = make(
    "small",
    "Jusqu’à 2 pièces : JPG, PNG, WebP, PDF, TXT, MD, CSV ou JSON. Vous choisissez quand les envoyer à l’IA locale.",
    "ai-attachment-hint",
  );
  const agenda = make("button", "Ouvrir mon agenda");
  agenda.onclick = options.onAgenda;
  actions.append(
    agenda,
    make(
      "small",
      "L’assistant ne lit pas automatiquement vos messages ni vos tâches. Dialogue conservé uniquement pendant cette session.",
    ),
  );
  footer.append(attachmentList, state, form, attachmentHint, actions);
  title.append(profile);
  view.append(header, thread, footer);
  options.container.replaceChildren(view);
  options.container.classList.add("ai-chatbox-host");

  const clearAttachments = () => {
    for (const entry of attachments)
      if (entry.preview) URL.revokeObjectURL(entry.preview);
    attachments.length = 0;
    renderAttachments();
  };
  const renderAttachments = () => {
    attachmentList.replaceChildren();
    for (const [index, entry] of attachments.entries()) {
      const chip = make("div", undefined, "ai-attachment-chip");
      if (entry.preview) {
        const thumbnail = make("img");
        thumbnail.src = entry.preview;
        thumbnail.alt = "";
        chip.append(thumbnail);
      }
      chip.append(make("span", entry.item.name));
      const remove = make("button", "×");
      remove.type = "button";
      remove.disabled = Boolean(active);
      remove.setAttribute("aria-label", `Retirer ${entry.item.name}`);
      remove.onclick = () => {
        if (entry.preview) URL.revokeObjectURL(entry.preview);
        attachments.splice(index, 1);
        renderAttachments();
      };
      chip.append(remove);
      attachmentList.append(chip);
    }
  };
  fileInput.onchange = async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = "";
    if (!files.length) return;
    if (attachments.length + files.length > 2) {
      state.textContent = "Deux pièces jointes au maximum par demande.";
      return;
    }
    preparing = true;
    attach.disabled = true;
    send.disabled = true;
    plan.disabled = true;
    state.textContent = "Lecture des fichiers sur cet appareil…";
    try {
      for (const file of files) {
        const item = await prepareChatAttachment(file);
        if (lifecycle.signal.aborted || !view.isConnected) return;
        const documentChars = [...attachments.map(({ item }) => item), item]
          .filter((entry) => entry.kind === "document")
          .reduce((total, entry) => total + entry.text.length, 0);
        if (documentChars > 12000)
          throw new Error(
            "Les extraits des documents dépassent la limite de cette demande.",
          );
        attachments.push({
          item,
          ...(item.kind === "image"
            ? { preview: URL.createObjectURL(file) }
            : {}),
        });
      }
      renderAttachments();
      state.textContent =
        "Fichier prêt. Il sera transmis au modèle local seulement quand vous enverrez votre demande.";
    } catch (error: any) {
      state.textContent = error.message;
    } finally {
      preparing = false;
      attach.disabled = false;
      send.disabled = !ready || Boolean(active);
      plan.disabled = !ready || Boolean(active);
    }
  };

  const render = () => {
    thread.replaceChildren();
    if (!history.length && !pending) {
      const welcome = make("div", undefined, "ai-chatbox-welcome");
      welcome.append(
        make("span", "✦", "ai-chatbox-welcome-icon"),
        make("h2", "Que souhaitez-vous préparer ?"),
        make(
          "p",
          "Je peux vous aider à réfléchir, rédiger et organiser votre travail. Si votre demande manque de détails, je vous poserai une question.",
        ),
        suggestions,
      );
      thread.append(welcome);
    }
    for (const turn of [
      ...history,
      ...(pending ? [{ role: "user" as const, text: pending }] : []),
    ]) {
      const bubble = make(
        "article",
        undefined,
        `ai-chatbox-message ${turn.role}`,
      );
      bubble.append(
        make("small", turn.role === "user" ? "Vous" : "Assistant IA"),
        make("p", turn.text),
      );
      thread.append(bubble);
    }
    if (pending)
      thread.append(
        make("p", "L’assistant prépare sa réponse…", "ai-chatbox-thinking"),
      );
    clear.disabled = !history.length && !pending;
    thread.scrollTop = thread.scrollHeight;
  };
  render();

  const headers = {
    Authorization: `Bearer ${options.token}`,
    "Content-Type": "application/json",
  };
  fetch("/assistant/api/status", { headers, signal: lifecycle.signal })
    .then(async (response) => {
      if (!response.ok)
        throw new Error("Session non autorisée. Reconnectez-vous.");
      const info = await response.json();
      if (lifecycle.signal.aborted || !view.isConnected) return;
      const role = Object.hasOwn(SUGGESTIONS, info.profile?.role)
        ? info.profile.role
        : "agent";
      const label =
        role === "responsable"
          ? "Responsable"
          : role === "administrateur"
            ? "Administrateur"
            : "Agent";
      profile.textContent = `${info.profile?.name || "Votre profil"} · ${label}`;
      suggestions.replaceChildren();
      for (const example of SUGGESTIONS[role]) {
        const choice = make("button", example);
        choice.onclick = () => {
          prompt.value = example;
          prompt.focus();
        };
        suggestions.append(choice);
      }
      if (!info.ready)
        throw new Error(
          "IA locale indisponible. Vérifiez que le modèle est démarré.",
        );
      ready = true;
      send.disabled = false;
      plan.disabled = false;
      state.textContent =
        "IA locale prête · Vos messages ne sont envoyés à aucun collègue.";
    })
    .catch((error) => {
      if (!lifecycle.signal.aborted) state.textContent = error.message;
    });

  const submitRequest = async (mode: "chat" | "project") => {
    const question =
      prompt.value.trim() ||
      (mode === "project" && (history.length || attachments.length)
        ? "Organise ce projet à partir de notre échange et des pièces jointes. Laisse vides les dates et responsables non précisés."
        : attachments.length
          ? "Analyse les pièces jointes et résume les points importants."
          : "");
    if (!question || !ready || preparing || active || options.locked()) return;
    active = new AbortController();
    const requestGeneration = generation;
    const label = attachments.length
      ? `\n📎 ${attachments.map(({ item }) => item.name).join(", ")}`
      : "";
    pending = question + label;
    prompt.value = "";
    send.disabled = true;
    plan.disabled = true;
    attach.disabled = true;
    cancel.hidden = false;
    renderAttachments();
    state.textContent =
      mode === "project"
        ? "L’IA prépare les groupes de tâches… Vérifiez ensuite chaque proposition."
        : "L’IA locale réfléchit… Le premier chargement peut prendre quelques minutes.";
    render();
    try {
      const response = await fetch("/assistant/api/run", {
        method: "POST",
        headers,
        signal: AbortSignal.any([lifecycle.signal, active.signal]),
        body: JSON.stringify({
          agent: mode,
          prompt: question,
          excerpts: [],
          attachments: attachments.map(({ item }) => item),
          history: history.slice(-8).map((turn) => ({
            role: turn.role,
            text: turn.text.slice(0, 900),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "La réponse de l’IA a échoué.");
      if (
        requestGeneration !== generation ||
        options.locked() ||
        !view.isConnected
      )
        return;
      history = [
        ...history,
        { role: "user", text: question + label },
        { role: "assistant", text: data.answer },
      ];
      options.onHistory(history);
      pending = "";
      clearAttachments();
      state.textContent =
        mode === "project"
          ? "Plan prêt à vérifier dans l’agenda. Aucun envoi effectué."
          : "Réponse reçue. Vérifiez les faits importants avant de l’utiliser.";
      render();
      if (mode === "project" && data.plan) options.onPlan(data.plan);
    } catch (error: any) {
      if (
        requestGeneration === generation &&
        view.isConnected &&
        !lifecycle.signal.aborted
      ) {
        prompt.value = question;
        pending = "";
        state.textContent = active?.signal.aborted
          ? "Demande annulée. Votre texte est prêt à être renvoyé."
          : error.message;
        render();
      }
    } finally {
      active = null;
      if (view.isConnected) {
        send.disabled = !ready || preparing;
        plan.disabled = !ready || preparing;
        attach.disabled = preparing;
        cancel.hidden = true;
        renderAttachments();
      }
    }
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    void submitRequest("chat");
  };
  plan.onclick = () => {
    void submitRequest("project");
  };
  prompt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  return () => {
    lifecycle.abort();
    active?.abort();
    clearAttachments();
    options.container.classList.remove("ai-chatbox-host");
  };
}
