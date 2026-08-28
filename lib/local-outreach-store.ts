import { EMPTY_SNAPSHOT, type OutreachSnapshot } from "./outreach-domain";

const DATABASE_NAME = "outreach-intelligence";
const STORE_NAME = "workspaces";
const VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLocalSnapshot(workspaceKey: string): Promise<OutreachSnapshot> {
  if (typeof indexedDB === "undefined") return EMPTY_SNAPSHOT;
  const database = await openDatabase();
  return new Promise<OutreachSnapshot>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(workspaceKey);
    request.onsuccess = () => resolve((request.result as OutreachSnapshot | undefined) ?? EMPTY_SNAPSHOT);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function saveLocalSnapshot(workspaceKey: string, snapshot: OutreachSnapshot): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(snapshot, workspaceKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}
