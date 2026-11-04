import test from "node:test";
import assert from "node:assert/strict";
import { projectInstruction } from "./project-delegation.js";
import { validateInstruction } from "./instructions.js";

const draft = {
  id: "task-1",
  title: "Réserver la salle",
  details: "Vérifier la capacité",
  date: "2026-11-12",
  group: "Logistique",
  assigneeId: "@agent:localhost",
};

test("Une délégation de projet produit une instruction bornée et liée à la tâche", () => {
  const content = projectInstruction("project-1", "Forum", draft);
  assert.equal(content.project_task_id, draft.id);
  assert.deepEqual(content.recipients, [draft.assigneeId]);
  assert.match(content.body, /Logistique/);
  assert.equal(content.deadline?.slice(0, 10), draft.date);
  assert.equal(
    validateInstruction(
      { roomId: "!room", sender: "@responsable:localhost", content },
      {
        roomId: "!room",
        members: ["@responsable:localhost", draft.assigneeId],
        role: "responsable",
        power: 50,
      },
    ),
    true,
  );
  assert.equal(
    validateInstruction(
      { roomId: "!room", sender: "@agent2:localhost", content },
      {
        roomId: "!room",
        members: ["@agent2:localhost", draft.assigneeId],
        role: "agent",
        power: 50,
      },
    ),
    false,
  );
});

test("Une attribution absente ou une date invalide bloque la publication", () => {
  assert.throws(() =>
    projectInstruction("project-1", "Forum", { ...draft, assigneeId: "" }),
  );
  assert.throws(() =>
    projectInstruction("project-1", "Forum", { ...draft, date: "2026-99-99" }),
  );
});
