// Store FileSystemHandle objects in IndexedDB so directory handles
// survive page refreshes (localStorage can't hold non-serialisable objects).

const DB_NAME = "markreview";
const STORE = "handles";

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    if (typeof indexedDB === "undefined") {
      dbPromise = Promise.reject(new Error("IndexedDB is not available"));
    } else {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
  }
  return dbPromise;
}

export async function saveHandle(
  key: string,
  handle: FileSystemHandle,
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function isFileSystemHandle(value: unknown): value is FileSystemHandle {
  if (value == null || typeof value !== "object") {
    return false;
  }
  if (!("kind" in value) || !("name" in value)) {
    return false;
  }
  const { kind } = value;
  return kind === "file" || kind === "directory";
}

export async function getHandle(
  key: string,
): Promise<FileSystemHandle | null> {
  const db = await getDB();
  return new Promise<FileSystemHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      const result: unknown = req.result;
      if (isFileSystemHandle(result)) {
        resolve(result);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/** Reset cached DB connection (for tests). */
export function resetHandleStore() {
  dbPromise = null;
}

export async function removeHandle(key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
