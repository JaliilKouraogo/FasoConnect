type Context = { text: string }[];
export async function openAssistant(options: {
  token: string;
  roomId: string;
  context: Context;
  panel: (title: string) => HTMLElement;
  insertDraft: (answer: string) => void;
  locked: () => boolean;
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
  p.append(el("small", "Qwen 3.5 · Entièrement sur votre ordinateur"));
  p.append(
    el(
      "p",
      "Un coup de main pour écrire, résumer ou organiser la suite. Vous choisissez les messages à lui montrer ; ils sont analysés en clair sur cet ordinateur. Rien n’est envoyé à votre place.",
    ),
  );
  const state = el("p", "Vérification du modèle local…");
  state.setAttribute("role", "status");
  const agentLabel = el("label", "Que souhaitez-vous faire ?"),
    agent = el("select");
  agent.setAttribute("aria-label", "Agent IA local");
  for (const [id, name] of [
    ["aide", "Guide FasoConnect"],
    ["redaction", "Rédiger un message"],
    ["synthese", "Résumer les extraits"],
    ["actions", "Repérer les actions et échéances"],
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
  const choices = options.context.map((excerpt) => {
    const row = el("label"),
      check = el("input");
    check.type = "checkbox";
    row.className = "ai-excerpt";
    row.append(check, el("span", excerpt.text));
    details.append(row);
    return { check, text: excerpt.text };
  });
  if (!choices.length)
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
  const run = el("button", "Demander à l’agent"),
    cancel = el("button", "Annuler la demande"),
    result = el("div");
  run.disabled = true;
  cancel.hidden = true;
  result.setAttribute("role", "status");
  const clear = el("button", "Effacer la réponse et la demande");
  clear.onclick = () => {
    result.replaceChildren();
    prompt.value = "";
    consent.checked = false;
    choices.forEach((x) => (x.check.checked = false));
  };
  p.append(
    state,
    agentLabel,
    label,
    details,
    consentLabel,
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
    if (excerpts.length && !consent.checked) {
      state.textContent =
        "Confirmez votre accord pour analyser les extraits cochés.";
      return;
    }
    if (options.locked()) {
      state.textContent =
        "La session ou la conversation a changé. Rouvrez l’assistant.";
      return;
    }
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
          consent: consent.checked,
          roomId: options.roomId,
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
          "Réponse générée par IA : vérifiez les faits, destinataires et échéances avant de l’utiliser.",
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
