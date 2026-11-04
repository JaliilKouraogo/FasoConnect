type Context = { text: string }[];
type SharedTask = { title: string; date: string; category: string };
const PROFILE_PRESETS = {
  agent: [
    [
      "Préparer une réponse",
      "redaction",
      "Rédige une réponse professionnelle à partir de ma demande et des extraits que je choisirai.",
    ],
    [
      "Comprendre une consigne",
      "synthese",
      "Résume les consignes sélectionnées : faits, décisions et questions ouvertes, avec leurs références.",
    ],
    [
      "Organiser mes tâches",
      "actions",
      "Relève les actions qui me sont confiées et leurs échéances explicites, avec leurs références.",
    ],
  ],
  responsable: [
    [
      "Rédiger une instruction",
      "redaction",
      "Propose une instruction de service claire : objectif, travail attendu, responsable et échéance seulement si ces éléments sont fournis.",
    ],
    [
      "Synthèse d'équipe",
      "synthese",
      "Résume les retours sélectionnés : faits, décisions et points en attente, avec leurs références.",
    ],
    [
      "Suivre les échéances",
      "actions",
      "Relève les actions, responsables et échéances explicitement mentionnés, avec leurs références.",
    ],
  ],
  administrateur: [
    [
      "Aide aux accès",
      "aide",
      "Comment vérifier les appareils et gérer un accès perdu dans FasoConnect ?",
    ],
    [
      "Rédiger une note",
      "redaction",
      "Aide-moi à rédiger une note claire à partir des éléments que je fournis, sans inventer de faits.",
    ],
    [
      "Préparer une procédure",
      "aide",
      "Quelles sont les étapes de révocation et de renouvellement d'une conversation ?",
    ],
  ],
} as const;
const ROLE_LABELS = {
  agent: "Agent",
  responsable: "Responsable",
  administrateur: "Administrateur",
};
export async function openAssistant(options: {
  token: string;
  roomId: string;
  context: Context;
  panel: (title: string) => HTMLElement;
  insertDraft: (answer: string) => void;
  locked: () => boolean;
  task?: SharedTask;
}) {
  const p = options.panel("Votre assistant"),
    abort = new AbortController();
  p.classList.add("assistant-panel");
  p.addEventListener("faso-close", () => abort.abort());
  const el = <T extends keyof HTMLElementTagNameMap>(tag: T, text?: string) => {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    return n;
  };
  const hero = el("section");
  hero.className = "assistant-hero";
  hero.append(
    el("small", "✦ IA locale · Qwen 3.5"),
    el("h3", "Un assistant pour votre travail"),
    el("p", "Des idées adaptées à votre rôle, toujours sous votre contrôle."),
  );
  p.append(hero);
  p.append(
    el(
      "p",
      options.task
        ? "Vous choisissez de montrer cette tâche à l’IA locale pour recevoir une suggestion de classement. L’agenda ne change pas automatiquement."
        : "Vous choisissez les messages à lui montrer. Leur texte est traité en clair par le modèle local après votre accord ; aucune réponse n'est envoyée à vos collègues automatiquement.",
    ),
  );
  const state = el("p", "Vérification du modèle local…");
  state.setAttribute("role", "status");
  const profile = el("p", "Chargement de votre profil…");
  profile.className = "assistant-profile";
  const presets = el("div");
  presets.className = "assistant-presets";
  const agentLabel = el("label", "Que souhaitez-vous faire ?"),
    agent = el("select");
  agent.setAttribute("aria-label", "Agent IA local");
  for (const [id, name] of [
    ["aide", "Guide FasoConnect"],
    ["redaction", "Rédiger un message"],
    ["synthese", "Résumer les extraits"],
    ["actions", "Repérer les actions et échéances"],
    ...(options.task ? [["organisation", "Classer une tâche"]] : []),
  ]) {
    const option = el("option", name);
    option.value = id;
    agent.append(option);
  }
  agentLabel.append(agent);
  const label = el("label", "Votre demande"),
    prompt = el("textarea");
  prompt.maxLength = 2000;
  prompt.rows = 3;
  prompt.placeholder =
    "Exemple : aide-moi à répondre poliment à cette demande.";
  label.append(prompt);
  const examples: Record<string, string> = {
    aide: "Comment démarrer une conversation et vérifier les appareils ?",
    redaction:
      "Aide-moi à rédiger une réponse professionnelle à partir des extraits sélectionnés.",
    synthese:
      "Résume les extraits sélectionnés : faits, décisions et questions ouvertes, avec leurs références.",
    actions:
      "Relève les actions, responsables et échéances explicitement mentionnés, avec leurs références.",
    organisation:
      "Propose une catégorie adaptée pour cette tâche. Si son titre est ambigu, pose-moi une question pour mieux la classer.",
  };
  prompt.value = examples.aide;
  agent.onchange = () => {
    if (!prompt.value.trim() || Object.values(examples).includes(prompt.value))
      prompt.value = examples[agent.value];
  };
  const details = el("details"),
    summary = el(
      "summary",
      `${options.context.length} extraits disponibles · Choisir ce que l’IA peut lire`,
    );
  details.append(summary);
  details.hidden = Boolean(options.task);
  const choices = options.context.map((excerpt) => {
    const row = el("label"),
      check = el("input");
    check.type = "checkbox";
    row.className = "ai-excerpt";
    row.append(check, el("span", excerpt.text));
    details.append(row);
    return { check, text: excerpt.text };
  });
  if (!choices.length && !options.task)
    details.append(
      el(
        "p",
        "Ouvrez une conversation pour sélectionner ses messages déjà déchiffrés. Les fichiers ne sont pas lus par l’IA.",
      ),
    );
  const consentLabel = el("label"),
    consent = el("input");
  consent.type = "checkbox";
  consentLabel.className = "ai-consent";
  consentLabel.append(
    consent,
    el(
      "span",
      "J’autorise l’analyse locale des extraits cochés pour cette demande.",
    ),
  );
  consentLabel.hidden = !choices.length;
  const taskLabel = el("label"),
    taskConsent = el("input");
  taskConsent.type = "checkbox";
  taskLabel.className = "ai-consent";
  taskLabel.hidden = !options.task;
  taskLabel.append(
    taskConsent,
    el(
      "span",
      options.task
        ? `J’autorise l’IA locale à lire cette tâche : ${options.task.title} (${options.task.date}).`
        : "",
    ),
  );
  const run = el("button", "Demander à l’agent"),
    cancel = el("button", "Annuler la demande"),
    result = el("div");
  run.className = "primary assistant-run";
  run.disabled = true;
  cancel.hidden = true;
  result.setAttribute("role", "status");
  const clear = el("button", "Effacer la réponse et la demande");
  clear.onclick = () => {
    result.replaceChildren();
    prompt.value = "";
    consent.checked = false;
    taskConsent.checked = false;
    choices.forEach((x) => (x.check.checked = false));
  };
  p.append(
    state,
    profile,
    presets,
    agentLabel,
    label,
    details,
    consentLabel,
    taskLabel,
    run,
    cancel,
    clear,
    result,
  );
  const headers = {
    Authorization: "Bearer " + options.token,
    "Content-Type": "application/json",
  };
  try {
    const response = await fetch("/assistant/api/status", {
      headers,
      signal: abort.signal,
    });
    if (!response.ok)
      throw new Error("Session non autorisée. Reconnectez-vous à FasoConnect.");
    const info = await response.json();
    const role = Object.hasOwn(PROFILE_PRESETS, info.profile?.role)
      ? (info.profile.role as keyof typeof PROFILE_PRESETS)
      : "agent";
    profile.textContent = `${info.profile?.name || "Votre profil"} · ${ROLE_LABELS[role]}`;
    for (const [title, mode, example] of PROFILE_PRESETS[role]) {
      const choice = el("button", title);
      choice.type = "button";
      choice.onclick = () => {
        agent.value = mode;
        prompt.value = example;
        prompt.focus();
      };
      presets.append(choice);
    }
    agent.value = PROFILE_PRESETS[role][0][1];
    prompt.value = PROFILE_PRESETS[role][0][2];
    if (options.task) {
      agent.value = "organisation";
      agent.disabled = true;
      presets.hidden = true;
      prompt.value = examples.organisation;
    }
    if (!info.ready)
      throw new Error(
        "Modèle local absent ou moteur arrêté. Lancez Configurer-IA.ps1 dans le dossier du projet.",
      );
    state.textContent = "Prêt · Qwen 3.5 2B · Aucun service d’IA extérieur";
    run.disabled = false;
  } catch (e: any) {
    if (!abort.signal.aborted) state.textContent = e.message;
  }
  let active: AbortController | undefined;
  cancel.onclick = () => active?.abort();
  run.onclick = async () => {
    if (!prompt.value.trim()) {
      state.textContent = "Écrivez votre demande.";
      return;
    }
    const excerpts = choices
      .filter((x) => x.check.checked)
      .map(({ text }) => ({ text }));
    if (["synthese", "actions"].includes(agent.value) && !excerpts.length) {
      state.textContent =
        "Sélectionnez d'abord des messages dans une conversation pour cette aide.";
      return;
    }
    if (excerpts.length && !consent.checked) {
      state.textContent =
        "Confirmez votre accord pour analyser les extraits cochés.";
      return;
    }
    if (options.task && !taskConsent.checked) {
      state.textContent = "Confirmez que l’IA locale peut lire cette tâche.";
      return;
    }
    if (options.locked()) {
      state.textContent =
        "La session ou la conversation a changé. Rouvrez l’assistant.";
      return;
    }
    const authorized = consent.checked || taskConsent.checked;
    if (excerpts.length) consent.checked = false;
    if (options.task) taskConsent.checked = false;
    active = new AbortController();
    run.disabled = true;
    clear.disabled = true;
    cancel.hidden = false;
    state.textContent =
      "L’agent travaille sur cet ordinateur… Le premier chargement peut prendre deux à trois minutes.";
    result.replaceChildren();
    try {
      const response = await fetch("/assistant/api/run", {
        method: "POST",
        headers,
        signal: AbortSignal.any([abort.signal, active.signal]),
        body: JSON.stringify({
          agent: agent.value,
          prompt: prompt.value,
          excerpts,
          consent: authorized,
          roomId: options.roomId,
          ...(options.task ? { task: options.task } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "La demande a échoué.");
      if (!p.isConnected || options.locked()) return;
      const answer = el("div", data.answer);
      answer.className = "ai-answer";
      result.append(
        el("h3", "Proposition de l’agent"),
        answer,
        el(
          "small",
          options.task
            ? "Suggestion de l’IA : vérifiez-la, puis modifiez vous-même la catégorie dans l’agenda."
            : "Réponse générée par IA : vérifiez les faits, destinataires et échéances avant de l’utiliser.",
        ),
      );
      if (options.roomId) {
        const insert = el("button", "Utiliser comme brouillon");
        insert.onclick = () => {
          if (options.locked()) {
            state.textContent =
              "Rouvrez la conversation avant de préparer le brouillon.";
            return;
          }
          options.insertDraft(data.answer);
          state.textContent =
            "Brouillon préparé. Relisez-le dans la conversation avant de l’envoyer.";
        };
        result.append(insert);
      }
      state.textContent = "Terminé localement. Aucun message envoyé.";
    } catch (e: any) {
      if (p.isConnected)
        state.textContent =
          active.signal.aborted || abort.signal.aborted
            ? "Demande annulée."
            : e.message;
    } finally {
      run.disabled = false;
      clear.disabled = false;
      cancel.hidden = true;
      active = undefined;
    }
  };
}
