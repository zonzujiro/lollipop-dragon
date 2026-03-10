// Store FileSystemHandle objects in IndexedDB so directory handles
// survive page refreshes (localStorage can't hold non-serialisable objects).

const DB_NAME = 'markreview'
const STORE = 'handles'

let dbPromise: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

export async function saveHandle(key: string, handle: FileSystemHandle): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(handle, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function isFileSystemHandle(value: unknown): value is FileSystemHandle {
  if (value == null || typeof value !== 'object') {
    return false
  }
  if (!('kind' in value) || !('name' in value)) {
    return false
  }
  const { kind } = value
  return kind === 'file' || kind === 'directory'
}

export async function getHandle<T extends FileSystemHandle = FileSystemHandle>(
  key: string,
): Promise<T | null> {
  const db = await getDB()
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => {
      const result: unknown = req.result
      // `as T` unavoidable: IndexedDB's IDBRequest.result is `any`, and after
      // the runtime guard confirms it is a FileSystemHandle, TypeScript cannot
      // narrow further to the generic sub-type T (File vs Directory).  Callers
      // are responsible for storing and retrieving the correct sub-type.
      if (isFileSystemHandle(result)) {
        resolve(result as T)
      } else {
        resolve(null)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

export async function removeHandle(key: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
