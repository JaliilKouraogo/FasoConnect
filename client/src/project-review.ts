import type { PersonalTask } from "./personal-tasks";
import type {
  DelegationDraft,
  DelegationRoom,
  ProjectPlan,
} from "./project-plan";

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

export function createProjectReview(options: {
  plan: ProjectPlan;
  rooms: DelegationRoom[];
  onSave: (tasks: PersonalTask[]) => Promise<void>;
  onPublish: (
    roomId: string,
    projectId: string,
    projectName: string,
    drafts: DelegationDraft[],
    onSent: (id: string) => Promise<void>,
  ) => Promise<void>;
}) {
  const projectId = options.plan.id || crypto.randomUUID();
  const sent = new Set<string>();
  const view = make("section", undefined, "project-review");
  view.append(
    make("h2", "Plan de projet proposé par l’IA"),
    make(
      "p",
      "Vérifiez les groupes, les tâches, les dates et les personnes. Une date choisie devient une échéance à 23 h 59. Rien n’est envoyé avant votre confirmation. Modifier ce plan après l’envoi ne change pas les instructions déjà publiées.",
    ),
  );
  const state = make("p", "Brouillon à relire.", "project-review-state");
  state.setAttribute("role", "status");
  const projectLabel = make("label", "Nom du projet");
  const projectName = make("input");
  projectName.maxLength = 120;
  projectName.value = options.plan.project;
  projectLabel.append(projectName);
  view.append(projectLabel);
  const roomLabel = make("label", "Conversation où déléguer les tâches");
  const roomChoice = make("select");
  const noRoom = make("option", "Choisir une conversation autorisée");
  noRoom.value = "";
  roomChoice.append(noRoom);
  for (const room of options.rooms) {
    const option = make("option", room.name);
    option.value = room.id;
    roomChoice.append(option);
  }
  roomLabel.append(roomChoice);
  if (options.rooms.length) view.append(roomLabel);
  else
    view.append(
      make(
        "p",
        "Vous pouvez enregistrer ce plan dans votre agenda. La délégation chiffrée est réservée aux responsables et administrateurs ayant les droits nécessaires dans une conversation.",
        "project-permission-note",
      ),
    );
  const groups = make("div", undefined, "project-review-groups");
  type Row = {
    id: string;
    removed: boolean;
    group: HTMLInputElement;
    title: HTMLInputElement;
    details: HTMLTextAreaElement;
    date: HTMLInputElement;
    hint: string;
    assignee: HTMLSelectElement;
  };
  const rows: Row[] = [];
  for (const group of options.plan.groups) {
    const card = make("section", undefined, "project-review-group");
    const groupLabel = make("label", "Groupe de tâches");
    const groupName = make("input");
    groupName.maxLength = 80;
    groupName.value = group.name;
    groupLabel.append(groupName);
    card.append(groupLabel);
    for (const task of group.tasks) {
      const item = make("div", undefined, "project-review-task");
      const titleLabel = make("label", "Tâche");
      const title = make("input");
      title.maxLength = 160;
      title.value = task.title;
      titleLabel.append(title);
      const detailsLabel = make("label", "Détails");
      const details = make("textarea");
      details.maxLength = 1000;
      details.rows = 2;
      details.value = task.details;
      detailsLabel.append(details);
      const dateLabel = make("label", "Date prévue (facultative)");
      const date = make("input");
      date.type = "date";
      date.value = task.date;
      dateLabel.append(date);
      const assigneeLabel = make("label", "Personne chargée de cette tâche");
      const assignee = make("select");
      assigneeLabel.append(assignee);
      const hint = task.assigneeHint
        ? make(
            "small",
            `Suggestion de l’IA : ${task.assigneeHint}. Vérifiez l’identité avant l’envoi.`,
          )
        : make(
            "small",
            "Aucune personne indiquée dans les informations fournies.",
          );
      const remove = make("button", "Retirer cette tâche");
      remove.type = "button";
      item.append(
        titleLabel,
        detailsLabel,
        dateLabel,
        assigneeLabel,
        hint,
        remove,
      );
      card.append(item);
      const row: Row = {
        id: task.id || crypto.randomUUID(),
        removed: false,
        group: groupName,
        title,
        details,
        date,
        hint: task.assigneeHint,
        assignee,
      };
      if (task.sent) sent.add(row.id);
      if (task.sent) remove.disabled = true;
      remove.onclick = () => {
        if (sent.has(row.id)) {
          state.textContent =
            "Cette instruction a déjà été envoyée et ne peut plus être retirée du plan.";
          return;
        }
        row.removed = true;
        item.remove();
      };
      rows.push(row);
    }
    groups.append(card);
  }
  view.append(groups);
  if (
    options.plan.roomId &&
    options.rooms.some((room) => room.id === options.plan.roomId)
  )
    roomChoice.value = options.plan.roomId;
  const updateAssignees = () => {
    const room = options.rooms.find((entry) => entry.id === roomChoice.value);
    for (const row of rows) {
      const original = options.plan.groups
        .flatMap((group) => group.tasks)
        .find((task) => task.id === row.id);
      const previous = row.assignee.value || original?.assigneeId || "";
      row.assignee.replaceChildren();
      const empty = make("option", "À attribuer après vérification");
      empty.value = "";
      row.assignee.append(empty);
      for (const member of room?.members || []) {
        const option = make("option", member.name);
        option.value = member.id;
        row.assignee.append(option);
      }
      if (room?.members.some((member) => member.id === previous))
        row.assignee.value = previous;
      else if (row.hint) {
        const matches =
          room?.members.filter((member) =>
            member.name
              .toLocaleLowerCase("fr")
              .includes(row.hint.toLocaleLowerCase("fr")),
          ) || [];
        if (matches.length === 1) row.assignee.value = matches[0].id;
      }
    }
  };
  roomChoice.onchange = updateAssignees;
  updateAssignees();
  const collect = () => {
    const name = projectName.value.trim();
    if (!name) throw new Error("Donnez un nom au projet.");
    const drafts: DelegationDraft[] = rows
      .filter((row) => !row.removed)
      .map((row) => {
        const group = row.group.value.trim(),
          title = row.title.value.trim();
        if (!group || !title)
          throw new Error(
            "Chaque groupe et chaque tâche doivent avoir un nom.",
          );
        return {
          id: row.id,
          title,
          details: row.details.value.trim(),
          date: row.date.value,
          group,
          assigneeId: row.assignee.value,
        };
      });
    if (!drafts.length)
      throw new Error("Conservez au moins une tâche dans le projet.");
    return { name, drafts };
  };
  const toTasks = (name: string, drafts: DelegationDraft[]): PersonalTask[] =>
    drafts.map((draft) => ({
      id: draft.id,
      title: draft.title,
      date: draft.date,
      category: "Travail",
      done: false,
      updatedAt: Date.now(),
      projectId,
      projectName: name,
      group: draft.group,
      details: draft.details,
      assigneeId: draft.assigneeId || undefined,
      roomId: roomChoice.value || undefined,
      assigneeName: options.rooms
        .find((room) => room.id === roomChoice.value)
        ?.members.find((member) => member.id === draft.assigneeId)?.name,
      delegationStatus: sent.has(draft.id) ? "sent" : "draft",
    }));
  const actions = make("div", undefined, "project-review-actions");
  const save = make("button", "Enregistrer dans mon agenda");
  const publish = make(
    "button",
    "Vérifier puis envoyer les délégations",
    "primary",
  );
  publish.disabled = !options.rooms.length;
  save.onclick = async () => {
    try {
      const { name, drafts } = collect();
      await options.onSave(toTasks(name, drafts));
      state.textContent =
        "Plan enregistré dans votre agenda local. Aucun message envoyé.";
    } catch (error: any) {
      state.textContent = error.message;
    }
  };
  publish.onclick = async () => {
    let lockedControls: Array<
      [
        (
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLSelectElement
          | HTMLButtonElement
        ),
        boolean,
      ]
    > = [];
    try {
      const room = options.rooms.find((entry) => entry.id === roomChoice.value);
      if (!room) throw new Error("Choisissez une conversation autorisée.");
      const { name, drafts } = collect();
      const remaining = drafts.filter((draft) => !sent.has(draft.id));
      if (!remaining.length)
        throw new Error(
          "Toutes les délégations de ce plan ont déjà été envoyées.",
        );
      if (remaining.some((draft) => !draft.assigneeId))
        throw new Error(
          "Attribuez chaque tâche à un membre de la conversation.",
        );
      if (
        !confirm(
          `Envoyer ${remaining.length} instruction${remaining.length > 1 ? "s" : ""} chiffrée${remaining.length > 1 ? "s" : ""} dans « ${room.name} » ? Vérifiez les tâches, les dates et les destinataires avant de confirmer.`,
        )
      )
        return;
      lockedControls = Array.from(
        view.querySelectorAll<
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLSelectElement
          | HTMLButtonElement
        >("input, textarea, select, button"),
      ).map((control) => [control, control.disabled]);
      for (const [control] of lockedControls) control.disabled = true;
      state.textContent = `Envoi de ${remaining.length} instruction${remaining.length > 1 ? "s" : ""} après votre confirmation…`;
      await options.onSave(toTasks(name, drafts));
      await options.onPublish(
        room.id,
        projectId,
        name,
        remaining,
        async (id) => {
          sent.add(id);
          try {
            await options.onSave(toTasks(name, drafts));
          } catch {
            state.textContent =
              "Instruction envoyée ; sauvegarde locale du statut indisponible.";
          }
          state.textContent = `${sent.size} délégation${sent.size > 1 ? "s" : ""} envoyée${sent.size > 1 ? "s" : ""}.`;
        },
      );
      state.textContent =
        "Toutes les instructions ont été envoyées après votre confirmation.";
    } catch (error: any) {
      state.textContent = error.message;
    } finally {
      for (const [control, wasDisabled] of lockedControls)
        control.disabled = wasDisabled;
      publish.disabled = !options.rooms.length;
    }
  };
  actions.append(save, publish);
  view.append(actions, state);
  return view;
}
