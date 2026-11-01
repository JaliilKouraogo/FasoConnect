import {
  loadPersonalTasks,
  savePersonalTasks,
  TASK_CATEGORIES,
  type PersonalTask,
} from "./personal-tasks";
import { createProjectReview } from "./project-review";
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
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (cls) el.className = cls;
  return el;
};
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthName = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    date,
  );
const readTaskImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/"))
      return reject(new Error("Choisissez une image valide."));
    if (file.size > 2_500_000)
      return reject(new Error("L’image doit faire 2,5 Mo maximum."));
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string")
        reject(new Error("Lecture de l’image impossible."));
      else resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Lecture de l’image impossible."));
    reader.readAsDataURL(file);
  });

export async function openAgenda(options: {
  container: HTMLElement;
  userId: string;
  onAskAI: (task: PersonalTask) => void;
  onBack: () => void;
  onStartProject: () => void;
  onReviewProject: (plan: ProjectPlan) => void;
  proposal?: ProjectPlan;
  delegationRooms: DelegationRoom[];
  onPublish: (
    roomId: string,
    projectId: string,
    projectName: string,
    drafts: DelegationDraft[],
    onSent: (id: string) => Promise<void>,
  ) => Promise<void>;
}) {
  const p = make("section", undefined, "agenda-view");
  p.setAttribute("aria-label", "Mon agenda et mes tâches");
  const header = make("header", undefined, "agenda-view-header");
  const back = make("button", "←", "agenda-view-back");
  back.setAttribute("aria-label", "Revenir aux conversations");
  back.onclick = options.onBack;
  const headingTitle = make("div", undefined, "agenda-view-title");
  headingTitle.append(
    make("h1", "Mon agenda"),
    make("small", "Calendrier et tâches personnelles"),
  );
  const startProject = make(
    "button",
    "Organiser un projet avec l’IA",
    "agenda-start-project",
  );
  startProject.onclick = options.onStartProject;
  header.append(
    back,
    make("span", "▦", "agenda-view-icon"),
    headingTitle,
    startProject,
  );
  const content = make("div", undefined, "agenda-view-content");
  const proposalHost = make("div", undefined, "agenda-proposal-host");
  const intro = make(
    "p",
    "Planifiez vos tâches et retrouvez vos échéances dans le calendrier. Elles restent chiffrées dans ce navigateur, sans synchronisation : effacer ses données supprimera l’agenda.",
  );
  const notice = make(
    "p",
    "Les tâches déjà enregistrées ne sont montrées à l’IA que si vous choisissez « Aider à classer » et confirmez leur partage local. Un plan de projet est proposé à partir des informations que vous donnez dans le chat IA.",
    "agenda-notice",
  );
  const state = make("p", "Chargement de l’agenda…", "agenda-state");
  state.setAttribute("role", "status");
  const toolbar = make("div", undefined, "agenda-toolbar");
  const previous = make("button", "←");
  previous.setAttribute("aria-label", "Mois précédent");
  const next = make("button", "→");
  next.setAttribute("aria-label", "Mois suivant");
  const heading = make("h3");
  toolbar.append(previous, heading, next);
  const calendar = make("div", undefined, "agenda-grid");
  const listHeading = make("h3", "Tâches du mois");
  const list = make("div", undefined, "agenda-list");
  const boardHeading = make("h2", "Tableau de suivi");
  const boardTools = make("div", undefined, "agenda-board-tools");
  const boardFilters = make("div", undefined, "agenda-board-filters");
  boardFilters.setAttribute("aria-label", "Filtrer le tableau");
  boardFilters.setAttribute("role", "group");
  let boardFilterValue = "all";
  for (const [value, label] of [
    ["all", "Toutes les tâches"],
    ["mine", "Mes tâches assignées"],
    ["priority", "Prioritaires"],
  ]) {
    const filter = make("button", label, "agenda-board-filter");
    filter.type = "button";
    filter.dataset.filter = value;
    filter.onclick = () => {
      boardFilterValue = value;
      renderBoard();
    };
    boardFilters.append(filter);
  }
  const boardProgress = make("span", "", "agenda-board-progress");
  boardTools.append(boardFilters, boardProgress);
  const board = make("div", undefined, "agenda-kanban");
  const form = make("form", undefined, "agenda-form");
  const formTitle = make("h3", "Nouvelle tâche");
  const titleLabel = make("label", "Tâche");
  const title = make("input");
  title.required = true;
  title.maxLength = 160;
  title.placeholder = "Ex. Préparer la réunion";
  titleLabel.append(title);
  const dateLabel = make("label", "Date prévue");
  const date = make("input");
  date.type = "date";
  date.required = true;
  date.value = dayKey(new Date());
  dateLabel.append(date);
  const categoryLabel = make("label", "Classement");
  const category = make("select");
  for (const name of TASK_CATEGORIES) {
    const option = make("option", name);
    option.value = name;
    category.append(option);
  }
  categoryLabel.append(category);
  const detailsLabel = make("label", "Description");
  const details = make("textarea");
  details.maxLength = 4000;
  details.placeholder = "Ajoutez le contexte, le résultat attendu ou les étapes…";
  detailsLabel.append(details);
  const assigneeLabel = make("label", "Affecter à");
  const assignee = make("select");
  assignee.append(make("option", "Non assignée"));
  const assignees = new Map<string, string>([
    [options.userId, `Moi · ${options.userId}`],
  ]);
  for (const room of options.delegationRooms)
    for (const member of room.members) assignees.set(member.id, member.name);
  for (const [id, name] of assignees) {
    const option = make("option", name);
    option.value = id;
    assignee.append(option);
  }
  assigneeLabel.append(assignee);
  const imageLabel = make("label", "Image de la tâche");
  const image = make("input");
  image.type = "file";
  image.accept = "image/jpeg,image/png,image/webp";
  imageLabel.append(image);
  const imagePreview = make("div", undefined, "agenda-image-preview");
  imagePreview.hidden = true;
  imageLabel.append(imagePreview);
  image.onchange = () => {
    const file = image.files?.[0];
    if (!file) {
      imagePreview.hidden = true;
      imagePreview.replaceChildren();
      return;
    }
    imagePreview.replaceChildren(make("span", `Image sélectionnée · ${file.name}`));
    imagePreview.hidden = false;
  };
  const submit = make("button", "Ajouter la tâche", "primary");
  submit.type = "submit";
  const cancel = make("button", "Annuler la modification");
  cancel.type = "button";
  cancel.hidden = true;
  form.append(
    formTitle,
    titleLabel,
    detailsLabel,
    dateLabel,
    categoryLabel,
    assigneeLabel,
    imageLabel,
    submit,
    cancel,
  );
  const layout = make("div", undefined, "agenda-layout");
  const calendarCard = make("section", undefined, "agenda-calendar-card");
  const workspace = make("section", undefined, "agenda-workspace");
  const projectBoard = make("section", undefined, "agenda-project-board");
  calendarCard.append(toolbar, calendar);
  workspace.append(listHeading, list, form);
  layout.append(calendarCard, workspace);
  content.append(
    intro,
    notice,
    state,
    proposalHost,
    boardHeading,
    boardTools,
    board,
    layout,
    projectBoard,
  );
  p.append(header, content);
  options.container.replaceChildren(p);
  options.container.classList.add("agenda-host");

  let tasks: PersonalTask[];
  try {
    tasks = await loadPersonalTasks(options.userId);
  } catch {
    state.textContent =
      "Agenda inaccessible sur cet appareil. Vérifiez que le stockage du navigateur est autorisé.";
    return;
  }
  if (!p.isConnected) return;
  const today = new Date();
  let month = new Date(today.getFullYear(), today.getMonth(), 1);
  let editing: string | null = null;
  const resetForm = () => {
    editing = null;
    form.reset();
    date.value = dayKey(new Date());
    details.value = "";
    assignee.value = "";
    image.value = "";
    imagePreview.hidden = true;
    imagePreview.replaceChildren();
    formTitle.textContent = "Nouvelle tâche";
    submit.textContent = "Ajouter la tâche";
    cancel.hidden = true;
  };
  const persist = async (updated: PersonalTask[]) => {
    await savePersonalTasks(options.userId, updated);
    tasks = updated;
    state.textContent = "Agenda enregistré sur cet appareil.";
    render();
  };
  if (options.proposal) {
    proposalHost.append(
      createProjectReview({
        plan: options.proposal,
        rooms: options.delegationRooms,
        onSave: async (incoming) => {
          const projectId = incoming[0].projectId;
          const merged = incoming.map((task) => {
            const existing = tasks.find((previous) => previous.id === task.id);
            return existing
              ? {
                  ...task,
                  done: existing.done,
                  assigneeName: task.assigneeName || existing.assigneeName,
                  roomId: task.roomId || existing.roomId,
                  delegationStatus:
                    existing.delegationStatus === "sent"
                      ? "sent"
                      : task.delegationStatus,
                }
              : task;
          });
          await persist([
            ...tasks.filter((task) => task.projectId !== projectId),
            ...merged,
          ]);
        },
        onPublish: options.onPublish,
      }),
    );
  }
  const render = () => {
    heading.textContent = monthName(month);
    calendar.replaceChildren();
    for (const label of ["L", "M", "M", "J", "V", "S", "D"])
      calendar.append(make("span", label, "agenda-weekday"));
    const firstOffset =
      (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
    for (let i = 0; i < firstOffset; i++) calendar.append(make("span"));
    const days = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate();
    for (let day = 1; day <= days; day++) {
      const key = dayKey(new Date(month.getFullYear(), month.getMonth(), day));
      const count = tasks.filter(
        (task) => task.date === key && !task.done,
      ).length;
      const cell = make("button", String(day), "agenda-day");
      cell.type = "button";
      if (key === dayKey(today)) cell.classList.add("is-today");
      if (count) {
        cell.classList.add("has-tasks");
        cell.append(make("span", String(count), "agenda-count"));
      }
      cell.setAttribute(
        "aria-label",
        `${day} ${monthName(month)} : ${count} tâche${count > 1 ? "s" : ""} en cours`,
      );
      cell.onclick = () => {
        date.value = key;
        title.focus();
      };
      calendar.append(cell);
    }
    list.replaceChildren();
    const visible = tasks
      .filter(
        (task) => !task.date || task.date.startsWith(dayKey(month).slice(0, 7)),
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || Number(a.done) - Number(b.done),
      );
    listHeading.textContent = `Tâches du mois · ${visible.length}`;
    if (!visible.length)
      list.append(
        make(
          "p",
          "Aucune tâche ce mois-ci. Ajoutez-en une ci-dessous.",
          "agenda-empty",
        ),
      );
    for (const task of visible) {
      const card = make("article", undefined, "agenda-task");
      if (task.done) card.classList.add("is-done");
      const check = make("input");
      check.type = "checkbox";
      check.checked = task.done;
      check.setAttribute(
        "aria-label",
        `Marquer ${task.title} comme ${task.done ? "à faire" : "terminée"}`,
      );
      check.onchange = async () => {
        try {
          await persist(
            tasks.map((item) =>
              item.id === task.id
                ? { ...item, done: check.checked, updatedAt: Date.now() }
                : item,
            ),
          );
        } catch {
          check.checked = !check.checked;
          state.textContent = "Enregistrement impossible.";
        }
      };
      const body = make("div", undefined, "agenda-task-body");
      body.append(
        make("strong", task.title),
        make(
          "small",
          `${task.date ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(new Date(task.date + "T12:00:00")) : "Sans date"} · ${task.category}${task.projectName ? ` · ${task.projectName} / ${task.group}` : ""}${task.assigneeName ? ` · ${task.assigneeName}` : ""}${task.delegationStatus === "sent" ? " · Instruction envoyée" : ""}`,
        ),
      );
      const actions = make("div", undefined, "agenda-task-actions");
      const edit = make("button", "Modifier");
      edit.onclick = () => {
        editing = task.id;
        title.value = task.title;
        date.value = task.date;
        category.value = task.category;
        formTitle.textContent = "Modifier la tâche";
        submit.textContent = "Enregistrer";
        cancel.hidden = false;
        title.focus();
      };
      const ask = make("button", "Aider à classer");
      ask.onclick = () => options.onAskAI(task);
      const remove = make("button", "Supprimer");
      remove.onclick = async () => {
        if (!confirm(`Supprimer la tâche « ${task.title} » ?`)) return;
        try {
          await persist(tasks.filter((item) => item.id !== task.id));
          if (editing === task.id) resetForm();
        } catch {
          state.textContent = "Suppression impossible.";
        }
      };
      actions.append(edit, ask, remove);
      card.append(check, body, actions);
      list.append(card);
    }
    renderBoard();
    projectBoard.replaceChildren();
    const projects = new Map<string, PersonalTask[]>();
    for (const task of tasks)
      if (task.projectId) {
        const group = projects.get(task.projectId) || [];
        group.push(task);
        projects.set(task.projectId, group);
      }
    if (projects.size) projectBoard.append(make("h2", "Mes projets"));
    for (const grouped of projects.values()) {
      const project = make("section", undefined, "agenda-project");
      project.append(make("h3", grouped[0].projectName || "Projet"));
      const byGroup = new Map<string, PersonalTask[]>();
      for (const task of grouped) {
        const group = byGroup.get(task.group || "Autres tâches") || [];
        group.push(task);
        byGroup.set(task.group || "Autres tâches", group);
      }
      for (const [name, entries] of byGroup) {
        const card = make("div", undefined, "agenda-project-group");
        card.append(make("h4", name));
        for (const task of entries)
          card.append(
            make(
              "p",
              `${task.done ? "✓ " : "○ "}${task.title}${task.assigneeName ? ` · ${task.assigneeName}` : ""}${task.delegationStatus === "sent" ? " · Envoyée" : ""}`,
            ),
          );
        project.append(card);
      }
      const review = make("button", "Réviser ce projet et ses délégations");
      review.onclick = () =>
        options.onReviewProject({
          id: grouped[0].projectId,
          roomId: grouped.find((task) => task.roomId)?.roomId,
          project: grouped[0].projectName || "Projet",
          groups: [...byGroup].map(([name, entries]) => ({
            name,
            tasks: entries.map((task) => ({
              id: task.id,
              title: task.title,
              details: task.details || "",
              date: task.date,
              assigneeHint: task.assigneeName || "",
              assigneeId: task.assigneeId,
              sent: task.delegationStatus === "sent",
            })),
          })),
        });
      project.append(review);
      projectBoard.append(project);
    }
  };
  const taskStatus = (task: PersonalTask): NonNullable<PersonalTask["status"]> =>
    task.status || (task.done ? "done" : "todo");
  const columns = [
    ["todo", "À faire", "Définir et préparer"],
    ["doing", "En cours", "Travail en cours"],
    ["review", "À valider", "Contrôle ou retour attendu"],
    ["done", "Terminées", "Travail clôturé"],
  ] as const;
  const renderBoard = () => {
    const filter = boardFilterValue;
    boardFilters.querySelectorAll("button").forEach((button) => {
      button.classList.toggle(
        "is-selected",
        button.dataset.filter === boardFilterValue,
      );
    });
    const filtered = tasks.filter((task) => {
      if (filter === "mine" && task.assigneeId !== options.userId)
        return false;
      if (filter === "priority" && task.category !== "Prioritaire") return false;
      return true;
    });
    const completed = tasks.filter((task) => taskStatus(task) === "done").length;
    boardProgress.textContent = `${completed}/${tasks.length} terminées`;
    board.replaceChildren();
    if (!tasks.length) {
      const empty = make("div", undefined, "agenda-board-welcome");
      empty.append(
        make("span", "✦", "agenda-board-welcome-icon"),
        make("strong", "Votre espace de pilotage"),
        make(
          "p",
          "Créez votre première tâche pour commencer à organiser votre travail.",
        ),
      );
      board.append(empty);
      return;
    }
    for (const [statusKey, label, hint] of columns) {
      const column = make("section", undefined, `agenda-kanban-column status-${statusKey}`);
      column.dataset.status = statusKey;
      const entries = filtered.filter((task) => taskStatus(task) === statusKey);
      const columnHeader = make("header", undefined, "agenda-kanban-column-header");
      columnHeader.append(
        make("div", undefined, "agenda-kanban-column-title"),
        make("span", String(entries.length), "agenda-kanban-count"),
      );
      columnHeader.querySelector(".agenda-kanban-column-title")?.append(
        make("strong", label),
        make("small", hint),
      );
      const cards = make("div", undefined, "agenda-kanban-cards");
      cards.dataset.status = statusKey;
      cards.ondragover = (event) => {
        event.preventDefault();
        column.classList.add("is-drag-over");
      };
      cards.ondragleave = () => column.classList.remove("is-drag-over");
      cards.ondrop = async (event) => {
        event.preventDefault();
        column.classList.remove("is-drag-over");
        const id = event.dataTransfer?.getData("text/task-id");
        if (!id) return;
        const nextStatus = statusKey;
        try {
          await persist(
            tasks.map((task) =>
              task.id === id
                ? {
                    ...task,
                    status: nextStatus,
                    done: nextStatus === "done",
                    updatedAt: Date.now(),
                  }
                : task,
            ),
          );
        } catch {
          state.textContent = "Déplacement impossible.";
        }
      };
      for (const task of entries) {
        const card = make("article", undefined, "agenda-kanban-card");
        card.draggable = true;
        card.dataset.taskId = task.id;
        card.ondragstart = (event) => {
          event.dataTransfer?.setData("text/task-id", task.id);
          card.classList.add("is-dragging");
        };
        card.ondragend = () => card.classList.remove("is-dragging");
        card.onclick = () => {
          editing = task.id;
          title.value = task.title;
          date.value = task.date;
          category.value = task.category;
          details.value = task.details || "";
          assignee.value = task.assigneeId || "";
          imagePreview.replaceChildren(
            make(
              "span",
              task.imageName ? `Image actuelle · ${task.imageName}` : "Image actuelle",
            ),
          );
          imagePreview.hidden = !task.imageData;
          formTitle.textContent = "Modifier la tâche";
          submit.textContent = "Enregistrer";
          cancel.hidden = false;
          title.focus();
        };
        const meta = [
          task.category,
          task.date
            ? new Intl.DateTimeFormat("fr-FR", {
                day: "numeric",
                month: "short",
              }).format(new Date(task.date + "T12:00:00"))
            : "Sans date",
        ];
        if (task.assigneeName) meta.push(task.assigneeName);
        card.append(
          make("strong", task.title),
          make("small", meta.join(" · ")),
        );
        if (task.details) card.append(make("p", task.details));
        if (task.imageData) {
          const preview = make("img", undefined, "agenda-task-image") as HTMLImageElement;
          preview.src = task.imageData;
          preview.alt = task.imageName || `Image de ${task.title}`;
          card.append(preview);
        }
        if (task.projectName)
          card.append(make("span", task.projectName, "agenda-kanban-project"));
        cards.append(card);
      }
      if (!entries.length)
        cards.append(make("p", "Déposez une tâche ici", "agenda-kanban-empty"));
      column.append(columnHeader, cards);
      board.append(column);
    }
  };
  previous.onclick = () => {
    month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
    render();
  };
  next.onclick = () => {
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    render();
  };
  cancel.onclick = resetForm;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const name = title.value.trim();
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date.value)) return;
    const existing = editing
      ? tasks.find((item) => item.id === editing)
      : undefined;
    let imageData = existing?.imageData;
    let imageName = existing?.imageName;
    const selectedImage = image.files?.[0];
    if (selectedImage) {
      try {
        imageData = await readTaskImage(selectedImage);
        imageName = selectedImage.name;
      } catch (error) {
        state.textContent =
          error instanceof Error ? error.message : "Image impossible à ajouter.";
        return;
      }
    }
    const selectedAssignee = assignee.value;
    const task: PersonalTask = {
      ...existing,
      id: editing || crypto.randomUUID(),
      title: name,
      date: date.value,
      category: category.value as PersonalTask["category"],
      details: details.value.trim() || undefined,
      imageData,
      imageName,
      assigneeId: selectedAssignee || undefined,
      assigneeName: selectedAssignee
        ? assignees.get(selectedAssignee)
        : undefined,
      done: editing
        ? tasks.find((item) => item.id === editing)?.done || false
        : false,
      updatedAt: Date.now(),
      status: editing
        ? existing?.status || (existing?.done ? "done" : "todo")
        : "todo",
    };
    submit.disabled = true;
    try {
      await persist(
        editing
          ? tasks.map((item) => (item.id === editing ? task : item))
          : [...tasks, task],
      );
      month = new Date(
        Number(date.value.slice(0, 4)),
        Number(date.value.slice(5, 7)) - 1,
        1,
      );
      resetForm();
      render();
    } catch {
      state.textContent = "Enregistrement impossible.";
    } finally {
      submit.disabled = false;
    }
  };
  state.textContent = tasks.length
    ? `${tasks.length} tâche${tasks.length > 1 ? "s" : ""} enregistrée${tasks.length > 1 ? "s" : ""} sur cet appareil.`
    : "Aucune tâche pour le moment · votre tableau est prêt.";
  render();
}
