export function projectInstruction(projectId, projectName, draft) {
  if (
    typeof projectId !== "string" ||
    !projectId ||
    typeof projectName !== "string" ||
    !projectName.trim() ||
    projectName.length > 120 ||
    !draft ||
    typeof draft.id !== "string" ||
    !draft.id ||
    typeof draft.title !== "string" ||
    !draft.title.trim() ||
    draft.title.length > 160 ||
    typeof draft.details !== "string" ||
    draft.details.length > 1000 ||
    typeof draft.group !== "string" ||
    !draft.group.trim() ||
    draft.group.length > 80 ||
    typeof draft.assigneeId !== "string" ||
    !draft.assigneeId.startsWith("@") ||
    typeof draft.date !== "string" ||
    (draft.date && !/^\d{4}-\d{2}-\d{2}$/.test(draft.date))
  )
    throw new Error("Tâche ou attribution invalide.");
  const deadline = draft.date ? new Date(`${draft.date}T23:59:00`) : null;
  if (deadline && !Number.isFinite(deadline.getTime()))
    throw new Error("Date de tâche invalide.");
  return {
    subject: draft.title.trim(),
    body: `Projet : ${projectName.trim()}\nGroupe : ${draft.group.trim()}\n${draft.details.trim() || draft.title.trim()}`,
    priority: "normale",
    deadline: deadline?.toISOString() || null,
    recipients: [draft.assigneeId],
    dossier: projectName.trim(),
    project_id: projectId,
    project_group: draft.group.trim(),
    project_task_id: draft.id,
  };
}
