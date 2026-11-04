export type PersonalTask = {
  id: string;
  title: string;
  date: string;
  category:
    | "À classer"
    | "Prioritaire"
    | "Travail"
    | "Rendez-vous"
    | "Personnel";
  done: boolean;
  updatedAt: number;
  projectId?: string;
  projectName?: string;
  group?: string;
  details?: string;
  imageData?: string;
  imageName?: string;
  assigneeId?: string;
  assigneeName?: string;
  roomId?: string;
  delegationStatus?: "draft" | "sent";
  status?: "todo" | "doing" | "review" | "done";
};

export const TASK_CATEGORIES: PersonalTask["category"][] = [
  "À classer",
  "Prioritaire",
  "Travail",
  "Rendez-vous",
  "Personnel",
];

const DATABASE = "fasoconnect-personal-agenda-v1";
const KEY_STORE = "keys";
const DATA_STORE = "tasks";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(KEY_STORE);
      db.createObjectStore(DATA_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionResult<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  work: (object: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = work(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

async function userKey(db: IDBDatabase, userId: string): Promise<CryptoKey> {
  const existing = await transactionResult<CryptoKey | undefined>(
    db,
    KEY_STORE,
    "readonly",
    (store) => store.get(userId),
  );
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  // A parallel tab may have created this key already: keep the first one.
  try {
    await transactionResult(db, KEY_STORE, "readwrite", (store) =>
      store.add(key, userId),
    );
    return key;
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "ConstraintError")
      throw error;
    const first = await transactionResult<CryptoKey>(
      db,
      KEY_STORE,
      "readonly",
      (store) => store.get(userId),
    );
    if (!first) throw error;
    return first;
  }
}

export async function loadPersonalTasks(
  userId: string,
): Promise<PersonalTask[]> {
  const db = await openDatabase();
  try {
    const record = await transactionResult<
      { iv: number[]; data: ArrayBuffer } | undefined
    >(db, DATA_STORE, "readonly", (store) => store.get(userId));
    if (!record) return [];
    const key = await userKey(db, userId);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(record.iv) },
      key,
      record.data,
    );
    const tasks = JSON.parse(new TextDecoder().decode(plain));
    if (!Array.isArray(tasks)) throw new Error("Agenda local illisible.");
    return tasks.filter(
      (task): task is PersonalTask =>
        task &&
        typeof task.id === "string" &&
        typeof task.title === "string" &&
        (task.date === "" || /^\d{4}-\d{2}-\d{2}$/.test(task.date)) &&
        TASK_CATEGORIES.includes(task.category) &&
        typeof task.done === "boolean" &&
        typeof task.updatedAt === "number" &&
        (!task.details || typeof task.details === "string") &&
        (!task.imageData ||
          (typeof task.imageData === "string" &&
            task.imageData.startsWith("data:image/") &&
            task.imageData.length <= 4_000_000)) &&
        (!task.imageName || typeof task.imageName === "string") &&
        (!task.assigneeId || typeof task.assigneeId === "string") &&
        (!task.assigneeName || typeof task.assigneeName === "string") &&
        (!task.status || ["todo", "doing", "review", "done"].includes(task.status)),
    );
  } finally {
    db.close();
  }
}

export async function savePersonalTasks(
  userId: string,
  tasks: PersonalTask[],
): Promise<void> {
  const db = await openDatabase();
  try {
    const key = await userKey(db, userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(tasks)),
    );
    await transactionResult(db, DATA_STORE, "readwrite", (store) =>
      store.put({ iv: Array.from(iv), data }, userId),
    );
  } finally {
    db.close();
  }
}
