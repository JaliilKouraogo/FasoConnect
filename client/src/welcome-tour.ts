const TOUR_VERSION = "v1";
const keyFor = (userId: string) =>
  `faso-welcome-tour-${TOUR_VERSION}:${userId}`;

export function welcomeTourSeen(userId: string) {
  try {
    return localStorage.getItem(keyFor(userId)) === "done";
  } catch {
    return sessionStorage.getItem(keyFor(userId)) === "done";
  }
}

const STEPS = [
  {
    icon: "✦",
    title: "Bienvenue dans FasoConnect",
    where: "Votre espace de travail",
    text: "Retrouvez vos échanges protégés, votre assistant IA et votre agenda dans un même endroit. Ce tour vous montre où commencer.",
  },
  {
    icon: "☷",
    title: "Messages et collègues",
    where: "Barre latérale · Nouveau message · Annuaire",
    text: "Choisissez un collègue dans l’annuaire pour démarrer une conversation. Les invitations reçues apparaissent dans la barre latérale.",
  },
  {
    icon: "◉",
    title: "Écrire, enregistrer et joindre",
    where: "Dans une conversation",
    text: "Envoyez du texte, un vocal enregistré directement, ou un fichier. Recherchez dans les messages et consultez les participants depuis l’en-tête du chat.",
  },
  {
    icon: "▣",
    title: "Dossiers et documents",
    where: "Dans une conversation · Dossiers",
    text: "Rassemblez les notes et documents liés à un sujet. Les participants de la conversation y accèdent selon leurs droits.",
  },
  {
    icon: "☑",
    title: "Instructions et suivi",
    where: "Dans une conversation · Instructions",
    text: "Un responsable peut publier une instruction chiffrée. Les agents suivent le travail confié ; la validation reste une décision du responsable.",
  },
  {
    icon: "✧",
    title: "Votre assistant IA local",
    where: "Barre latérale · Mon assistant de travail",
    text: "Discutez avec l’IA, joignez un document ou une image, et demandez un plan de projet. Vous relisez les propositions avant de les enregistrer ou de déléguer.",
  },
  {
    icon: "▦",
    title: "Agenda et projets",
    where: "Barre latérale · Mon agenda et mes tâches",
    text: "Planifiez vos tâches, classez-les par projet et groupe, puis suivez les dates. L’agenda personnel reste chiffré dans ce navigateur et n’est pas synchronisé.",
  },
  {
    icon: "◇",
    title: "Appareils et sécurité",
    where: "Mon espace · Appareils et clés",
    text: "Comparez le code de sécurité d’un appareil directement avec votre collègue avant de le confirmer. Les fonctions d’administration dépendent du rôle et des droits.",
  },
  {
    icon: "♧",
    title: "Restez informé",
    where: "Mon espace · Notifications",
    text: "Choisissez les alertes pour messages, invitations, instructions et tâches. Le navigateur demande votre autorisation ; aucun contenu privé n’apparaît dans l’alerte.",
  },
] as const;

export function showWelcomeTour(options: {
  userId: string;
  panel: (title: string) => HTMLElement;
  close: () => void;
}) {
  const p = options.panel("Découvrir FasoConnect");
  p.classList.add("welcome-tour-panel");
  const markSeen = () => {
    try {
      localStorage.setItem(keyFor(options.userId), "done");
    } catch {
      sessionStorage.setItem(keyFor(options.userId), "done");
    }
  };
  p.addEventListener("faso-close", markSeen, { once: true });
  const create = <T extends keyof HTMLElementTagNameMap>(
    tag: T,
    text?: string,
    cls?: string,
  ) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  };
  const progress = create("p", undefined, "tour-progress");
  const card = create("section", undefined, "tour-card");
  const dots = create("div", undefined, "tour-dots");
  const actions = create("div", undefined, "tour-actions");
  const skip = create("button", "Passer le tour");
  const previous = create("button", "Précédent");
  const next = create("button", "Suivant", "primary");
  skip.onclick = options.close;
  previous.onclick = () => {
    index--;
    render();
  };
  next.onclick = () => {
    if (index === STEPS.length - 1) options.close();
    else {
      index++;
      render();
    }
  };
  actions.append(skip, previous, next);
  p.append(progress, card, dots, actions);
  let index = 0;
  const render = () => {
    const step = STEPS[index];
    progress.textContent = `Étape ${index + 1} sur ${STEPS.length}`;
    card.replaceChildren(
      create("span", step.icon, "tour-icon"),
      create("h3", step.title),
      create("p", step.text),
      create("small", `Où le trouver : ${step.where}`),
    );
    dots.replaceChildren();
    for (let i = 0; i < STEPS.length; i++) {
      const dot = create("span", undefined, i === index ? "active" : "");
      dot.setAttribute("aria-hidden", "true");
      dots.append(dot);
    }
    previous.disabled = index === 0;
    next.textContent = index === STEPS.length - 1 ? "Commencer" : "Suivant";
    skip.hidden = index === STEPS.length - 1;
  };
  render();
}
