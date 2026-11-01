export type ProjectTaskDraft = {
  id?: string;
  title: string;
  details: string;
  date: string;
  assigneeHint: string;
  assigneeId?: string;
  sent?: boolean;
};

export type ProjectPlan = {
  id?: string;
  roomId?: string;
  project: string;
  groups: { name: string; tasks: ProjectTaskDraft[] }[];
};

export type DelegationDraft = {
  id: string;
  title: string;
  details: string;
  date: string;
  group: string;
  assigneeId: string;
};

export type DelegationRoom = {
  id: string;
  name: string;
  members: { id: string; name: string }[];
};
