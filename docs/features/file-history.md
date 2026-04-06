# MarkReview — File History & Reopening

## 1. Overview

MarkReview gains a persistent history of opened files and folders. When a user closes a tab, the app retains enough information to reopen it later — including reconnecting any active shares. A history dropdown in the header provides access to previously opened documents.

---

## 2. Context

Currently, closing a tab permanently discards the file handle (deleted from IndexedDB) and removes the tab from state. Share records survive in localStorage (keyed by stable name, not tab ID), but there's no way to reopen the file and reconnect them.

Users who share a document, close the tab, and later want to check for peer comments must re-open the file through the OS picker, and the share association is restored only because the stable key matches. This works but is invisible — the user doesn't know which files had active shares.

---

## 3. User Decisions

| Decision            | Choice                                                    |
| ------------------- | --------------------------------------------------------- |
| History storage     | IndexedDB for handles, localStorage for metadata          |
| History limit       | Last 20 entries (oldest evicted on overflow)              |
| Reopen UX           | Header history dropdown only (FilePicker stays untouched) |
| Permission handling | Re-request on reopen; show status indicator               |
| Share reconnection  | Automatic via stable key (already works)                  |

---

## 4. Architecture

### 4.1 Data Model

```
HistoryEntry {
  id: string                    // crypto.randomUUID()
  type: 'file' | 'directory'
  name: string                  // file or folder name
  stableKey: string             // directoryName ?? fileName (matches share key)
  closedAt: string              // ISO 8601
  activeFilePath: string | null // last viewed file (for folders)
  hasActiveShares: boolean      // snapshot at close time
}
```

Stored in localStorage as `markreview-history` (JSON array).

File/directory handles stored in IndexedDB under keys: `history:${entry.id}`.

### 4.2 Lifecycle

**On tab close:**

1. Before deleting the tab, create a `HistoryEntry` from its state.
2. Move the IndexedDB handle from `tab:${tabId}:file` (or `:directory`) to `history:${entryId}`.
3. Remove the tab from `tabs[]` as today.
4. Append entry to history; evict oldest if over limit (also revoke its IndexedDB handle).

**On reopen from history:**

1. Retrieve the handle from IndexedDB (`history:${entryId}`).
2. If handle is missing (cleared by browser), show error and remove entry.
3. Request permission via `handle.requestPermission({ mode: 'readwrite' })`.
4. If denied, offer read-only mode or cancel.
5. Create a new tab with the restored handle.
6. Shares reconnect automatically — `restoreTabs` already matches by stable key.
7. Remove the entry from history (it's now an open tab again).

**On page load:**

- Clean expired history entries (older than 30 days).
- Do NOT eagerly check handle validity (requires user gesture).

### 4.3 Permission Model

The File System Access API requires a user gesture to re-grant permission after a page reload. When reopening from history:

- `queryPermission({ mode: 'readwrite' })` checks current state without prompting.
- `requestPermission({ mode: 'readwrite' })` prompts the user (requires click context).
- If readwrite is denied, fall back to `requestPermission({ mode: 'read' })`.
- History entries show a lock/unlock icon based on last-known permission state.

### 4.4 UI

**Header history dropdown:**

A small clock/history icon in the header. Clicking it opens a dropdown listing recent entries. Available whenever at least one history entry exists.

```
┌──────────────────────────────┐
│  Recent                      │
│  ┌────────────────────────┐  │
│  │ feature-toggles.md     │  │
│  │ Mar 12 · 1 share       │  │
│  ├────────────────────────┤  │
│  │ project-docs/          │  │
│  │ Mar 11 · 3 shares      │  │
│  ├────────────────────────┤  │
│  │ brainstorm.md          │  │
│  │ Mar 10                 │  │
│  └────────────────────────┘  │
│            Clear history     │
└──────────────────────────────┘
```

Clicking an entry triggers the reopen flow (permission prompt if needed). The FilePicker (landing page) is not modified.

---

## 5. State Changes

### New types (`src/types/history.ts`)

```typescript
interface HistoryEntry {
  id: string;
  type: "file" | "directory";
  name: string;
  stableKey: string;
  closedAt: string;
  activeFilePath: string | null;
  hasActiveShares: boolean;
}
```

### New store fields (`AppState`)

```
history: HistoryEntry[]
```

### New store actions

```
reopenFromHistory(entryId: string): Promise<void>
removeHistoryEntry(entryId: string): void
clearHistory(): void
```

### Modified actions

```
removeTab(tabId: string)  — archive to history instead of discarding
```

### New localStorage key

```
markreview-history  — JSON array of HistoryEntry
```

### New IndexedDB keys

```
history:${entryId}  — FileSystemHandle for the entry
```

---

## 6. Steps

**6.1 — History data model and persistence**

- Define `HistoryEntry` type.
- Add `history[]` to store, persisted in localStorage.
- Add `saveHistoryHandle` / `getHistoryHandle` / `removeHistoryHandle` to `handleStore.ts`.
- **Deliverable:** History entries can be created, stored, and retrieved.

**6.2 — Archive on tab close**

- Modify `removeTab` to create a `HistoryEntry` before removing the tab.
- Move the IndexedDB handle to a `history:` key instead of deleting it.
- Enforce the 20-entry limit (evict oldest, clean up their IndexedDB handles).
- **Deliverable:** Closing a tab preserves it in history.

**6.3 — Reopen from history**

- Implement `reopenFromHistory` action: retrieve handle, request permission, create tab, remove from history.
- Handle missing handles and permission denial gracefully.
- Verify share records reconnect via stable key.
- **Deliverable:** User can reopen a previously closed file/folder with shares intact.

**6.4 — Header history dropdown**

- History icon in the header (visible when history entries exist).
- Dropdown lists entries with name, type icon, close date, and active share count.
- Click to reopen; show permission prompt if needed.
- "Clear history" button at the bottom.
- **Deliverable:** History accessible from the header; clicking reopens files.

**6.5 — Cleanup and expiry**

- On page load, prune entries older than 30 days (and their IndexedDB handles).
- On reopen failure (handle gone), remove entry and show toast.
- **Deliverable:** History stays clean; stale entries don't accumulate.

**6.6 — Testing**

- Unit tests: history CRUD, limit enforcement, expiry pruning.
- Unit tests: `removeTab` creates history entry and moves handle.
- Integration test: close tab -> reopen from history -> shares reconnected.
- Manual test: page reload -> history persists -> reopen works after permission grant.
- **Deliverable:** Test suite passes; full close-reopen cycle verified.

---

## 7. Edge Cases

- **Browser clears IndexedDB**: Handle is gone. Show "File access expired — please reopen manually" and remove the entry.
- **File moved or deleted on disk**: Handle becomes invalid. Same UX as above.
- **Multiple tabs for the same file**: Only the last-closed entry is kept (deduplicate by `stableKey`).
- **History full (20 entries)**: Oldest entry evicted; its IndexedDB handle is also cleaned up.
- **Shares expired while tab was closed**: Share records are pruned by existing `loadAndCleanShares()` logic on next load. History entry's `hasActiveShares` badge updates accordingly.
