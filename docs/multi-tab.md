# MarkReview v4 — Multi-Tab Support

## 1. Overview

MarkReview v4 adds a tabbed interface allowing users to open multiple files and folders simultaneously. Each tab is an independent workspace with its own comments, sharing, and sidebar state. A horizontal tab bar below the header provides navigation between open documents.

---

## 2. Context

Currently, markreview supports opening one file or one folder at a time. Opening a new file or folder replaces the existing one. Users who need to cross-reference multiple documents or switch between projects must re-open them each time.

v4 addresses this by introducing browser-style tabs. Each tab encapsulates a complete workspace — its own file content, comment set, sidebar state, and active shares. Users can open several files and folders in parallel and switch between them instantly.

---

## 3. User Decisions

| Decision          | Choice                                                    |
| ----------------- | --------------------------------------------------------- |
| Comment scope     | Independent per tab — each tab owns its own comments      |
| Sharing scope     | Per tab — each tab can be shared independently            |
| Tab bar placement | Horizontal strip below the header, above the content area |
| Peer mode         | Stays as full-screen takeover, not in tabs                |

---

## 4. Architecture

### 4.1 State Model

The current flat Zustand store is restructured into two layers:

**TabState** — per-tab, encapsulates one workspace:

```
TabState {
  id: string                    // crypto.randomUUID()
  label: string                 // display name (file or folder name)

  // File
  fileHandle: FileSystemFileHandle | null
  fileName: string | null
  rawContent: string

  // Folder
  directoryHandle: FileSystemDirectoryHandle | null
  directoryName: string | null
  fileTree: FileTreeNode[]
  activeFilePath: string | null
  sidebarOpen: boolean

  // Comments
  comments: Comment[]
  resolvedComments: Comment[]
  activeCommentId: string | null
  commentPanelOpen: boolean
  commentFilter: CommentType | "all" | "pending" | "resolved"
  allFileComments: Record<string, FileCommentEntry>
  pendingScrollTarget: { filePath: string; rawStart?: number; blockIndex?: number } | null

  // Write
  writeAllowed: boolean
  undoState: { rawContent: string } | null

  // Sharing
  shares: ShareRecord[]
  sharedPanelOpen: boolean
  pendingComments: Record<string, PeerComment[]>
  shareKeys: Record<string, CryptoKey>
  activeDocId: string | null

  // Polling
  pollTimerId: ReturnType<typeof setInterval> | null
  lastKnownContentModified: string | null
  lastKnownCommentCounts: Record<string, number>
  contentUpdateAvailable: boolean
}
```

**GlobalState** — stays at the top level of the store:

```
tabs: TabState[]
activeTabId: string | null

theme: "light" | "dark"
focusMode: boolean
toast: string | null

// Peer mode (full-screen takeover, not in tabs)
isPeerMode: boolean
peerName: string | null
sharedContent: SharePayload | null
myPeerComments: PeerComment[]
// ... peer-specific polling/keys
```

### 4.2 Active Tab Access

A convenience selector `useActiveTab()` (in `src/store/selectors.ts`) returns the active `TabState` or `null`. Components use this instead of reading tab-scoped fields directly from the store. Individual field selectors are also provided:

```ts
export function useActiveTab(): TabState | null;
export function useActiveTabField<K extends keyof TabState>(
  field: K,
): TabState[K] | undefined;
```

### 4.3 Store Helper: `updateActiveTab`

An internal helper wraps the common pattern of updating the active tab within the `tabs` array:

```ts
function updateActiveTab(
  get: () => AppState,
  set: SetState<AppState>,
  updater: (tab: TabState) => Partial<TabState>,
);
```

All existing actions that modify tab-scoped fields use this helper.

---

## 5. Tab Management Actions

| Action                    | Behavior                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addTab(tab)`             | Create tab with new UUID, push to `tabs[]`, set as `activeTabId`                                                                                      |
| `removeTab(tabId)`        | Stop polling, remove from `tabs[]`, switch to adjacent tab or show FilePicker if last                                                                 |
| `switchTab(tabId)`        | Set `activeTabId` — no save/restore needed, all state lives in `tabs[]`                                                                               |
| `openFileInNewTab()`      | Show file picker dialog; if a tab with the same file is already open (compared via `isSameEntry`), focus it instead of creating a duplicate           |
| `openDirectoryInNewTab()` | Show directory picker dialog; if a tab with the same directory is already open (compared via `isSameEntry`), focus it instead of creating a duplicate |

Existing `openFile()` and `openDirectory()` become wrappers that create new tabs.

---

## 6. Tab Bar UI

### 6.1 Component: `src/components/TabBar.tsx`

- Horizontal flexbox strip between `<Header>` and `<div className="app-body">`
- Each tab renders as a button showing the tab label and a close (×) button
- Active tab has accent bottom border and distinct background
- "+" button at the right end opens a dropdown to choose file or folder
- Tabs scroll horizontally if they overflow
- Reads `tabs`, `activeTabId` from store; calls `switchTab`, `removeTab`

### 6.2 Tab Label

- Folder tab: `tab.directoryName`
- Single file tab: `tab.fileName`
- Fallback: `"untitled"`

### 6.3 CSS

New BEM classes in `src/index.css`: `.tab-bar`, `.tab-bar__tab`, `.tab-bar__tab--active`, `.tab-bar__close`, `.tab-bar__add`. Light and dark theme variants using existing CSS variables.

---

## 7. App Rendering Logic

Three paths (peer mode unchanged):

1. **Peer mode** → full-screen takeover, no tabs shown
2. **No tabs** (`tabs.length === 0`) → `<FilePicker />`
3. **Has tabs** → `<Header>` + `<TabBar>` + active tab content (sidebar, markdown renderer, comment panel, shared panel)

The active tab's state drives which sidebar, comments, and panels are shown.

---

## 8. Keyboard Shortcuts

| Shortcut                      | Action                                  |
| ----------------------------- | --------------------------------------- |
| `Cmd+W` / `Ctrl+W`            | Close active tab                        |
| `Cmd+T` / `Ctrl+T`            | Open new tab (file picker)              |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle through tabs                      |
| `Cmd+B` / `Ctrl+B`            | Toggle sidebar (active tab) — unchanged |

---

## 9. Persistence

### 9.1 localStorage (Zustand persist)

- Persist version bumped to `2`
- `partialize` saves: `tabs[]` (minus non-serializable fields: handles, CryptoKeys, timers), `activeTabId`, `theme`, `peerName`
- Migration function: detect old flat format (has `fileName` but no `tabs`), wrap into single-tab structure

### 9.2 IndexedDB (handleStore)

- Change key scheme from `"directory"` to `"tab:<tabId>:directory"`
- Migration: rename old `"directory"` key for the migrated tab

### 9.3 Share persistence

- Change localStorage structure from `ShareRecord[]` to `Record<tabId, ShareRecord[]>`
- Migration: wrap old flat array under the migrated tab's ID

---

## 10. Startup & Restore

On page load:

1. Zustand hydrates `tabs[]` and `activeTabId` from localStorage
2. Migration runs if old format detected
3. `restoreAllTabs()` iterates persisted tabs and restores each directory handle from IndexedDB
4. If a handle can't be restored (permission denied), tab keeps `null` handle — user re-grants when switching to it

---

## 11. Component Impact

| Component                  | Scope of change                                                                  |
| -------------------------- | -------------------------------------------------------------------------------- |
| `App.tsx`                  | Add TabBar, update selectors to use activeTab, update FileSystemObserver effects |
| `Header.tsx`               | Switch all tab-scoped selectors to useActiveTab, open-in-new-tab actions         |
| `FilePicker.tsx`           | Use `openFileInNewTab` / `openDirectoryInNewTab`                                 |
| `MarkdownRenderer.tsx`     | Update selectors to read from active tab                                         |
| `CommentPanel.tsx`         | Update selectors to read from active tab                                         |
| `CommentMargin.tsx`        | Update selectors to read from active tab                                         |
| `SharedPanel.tsx`          | Update selectors to read from active tab                                         |
| `ShareDialog.tsx`          | Update selectors to read from active tab                                         |
| `UndoToast.tsx`            | Update selectors to read from active tab                                         |
| `PendingCommentReview.tsx` | Update selectors to read from active tab                                         |
| `PeerCommentCard.tsx`      | Update selectors to read from active tab                                         |
| `Toast.tsx`                | No change (global state)                                                         |
| `PeerNamePrompt.tsx`       | No change (global state)                                                         |

---

## 12. New Files

| File                        | Purpose                                            |
| --------------------------- | -------------------------------------------------- |
| `src/types/tab.ts`          | `TabState` interface, `createDefaultTab()` factory |
| `src/store/selectors.ts`    | `useActiveTab()`, `useActiveTabField()` hooks      |
| `src/components/TabBar.tsx` | Tab bar UI component                               |

---

## 13. Implementation Order

### Phase 1: Foundation (store refactoring)

1. Define `TabState` type
2. Restructure store: `tabs[]` + `activeTabId` + global fields
3. Add `updateActiveTab` helper
4. Add tab management actions
5. Migrate all existing actions to use `updateActiveTab`
6. Create selector hooks
7. Update persistence config with migration
8. Update `handleStore.ts` for tab-keyed handles
9. Update share save/load for tab-keyed structure
10. Update debounced auto-sync subscription

### Phase 2: Tab bar UI

11. Create `TabBar.tsx` component
12. Add tab bar CSS

### Phase 3: Component migration

13. Update `App.tsx`
14. Update `FilePicker.tsx`
15. Update `Header.tsx`
16. Update `MarkdownRenderer.tsx`, `CommentPanel.tsx`, `CommentMargin.tsx`
17. Update `SharedPanel.tsx`, `ShareDialog.tsx`, `UndoToast.tsx`
18. Update `PendingCommentReview.tsx`, `PeerCommentCard.tsx`

### Phase 4: Polish

19. Add keyboard shortcuts (Cmd+W, Cmd+T, Ctrl+Tab)
20. Update tests

---

## 14. Verification

1. Open a single file → appears in a tab, all comments/sharing works as before
2. Open a folder → appears as a tab with sidebar
3. Open another file/folder → second tab appears, switching works
   3a. Re-open the same file/folder → existing tab is focused, no duplicate created
4. Close a tab → adjacent tab becomes active, or FilePicker if last
5. Comments in each tab are independent
   5a. In folder mode, comments on files with the same name in different directories show distinct file paths in the comment panel
6. Share from tab A, switch to tab B, switch back — share tracked in tab A
7. Refresh page → tabs restore, directory handles restored from IndexedDB
8. Peer mode via URL → full-screen takeover, tabs hidden, works as before
9. Keyboard shortcuts (Cmd+W, Ctrl+Tab) work correctly
