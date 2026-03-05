# Project Rules

## TypeScript

- **Never use `as` for type assertions.** Use type guards, proper narrowing, or helper functions instead.

## Architecture Overview

The app has two runtime modes that use **completely separate state**:

- **Host mode** -- The user opens local files/folders. State lives inside `TabState` objects (`tabs[]`). Each tab has its own `activeFilePath`, `comments`, `rawContent`, `commentPanelOpen`, etc.
- **Peer mode** -- The user opens a shared link. State lives at the **store root** as `peer*` fields (`peerActiveFilePath`, `peerRawContent`, `peerComments`, `peerCommentPanelOpen`, etc.). Peer mode does NOT use tabs.

The `isPeerMode` boolean on the store root determines which mode is active.

### Common Bug: Reading From the Wrong State

If a component reads tab state while in peer mode (or vice versa), it will get stale/empty data. Always check which mode you're in and read the correct state source.

## State Management

- **Store**: Zustand with `persist` middleware in `src/store/index.ts`.
- **`AppState` interface** (in `src/store/index.ts`): defines all state and actions.
- **`TabState` interface** (in `src/types/tab.ts`): defines per-tab state.

### Tab-scoped state (host mode)

- Accessed via `getActiveTab(state)` or `useActiveTab()` / `useActiveTabField(field)` from `src/store/selectors.ts`.
- Store actions that mutate tab state use the `updateActiveTab` internal helper.

### Global peer state (peer mode)

- Accessed directly from the store root: `peerRawContent`, `peerFileName`, `peerActiveFilePath`, `peerComments`, `peerResolvedComments`, `peerCommentPanelOpen`, `myPeerComments`, `submittedPeerCommentIds`, `sharedContent`, etc.

### When adding new state

- Decide whether it is tab-scoped or global. If it only matters in host mode, put it on `TabState`. If it only matters in peer mode or is truly global, put it on `AppState` root.
- Put shared selectors in `src/store/selectors.ts` to avoid logic duplication.

## Component Conventions

- Components that work in both modes (`CommentPanel`, `Header`, `CommentMargin`, `MarkdownRenderer`) receive a **`peerMode` prop**.
- In peer mode: read from global peer state (e.g., `useAppStore(s => s.peerActiveFilePath)`).
- In host mode: read from active tab via selectors (e.g., `useActiveTabField('activeFilePath')`).
- Never mix the two -- guard on `peerMode` before accessing state.

## Testing Patterns

- **`setTestState(tabOverrides, globalOverrides)`** from `src/test/testHelpers.ts` -- sets up a test tab as active and merges global overrides.
- **`resetTestStore()`** -- resets to a clean state.
- Use top-level `vi.mock()` for module mocks (Vitest hoists these before imports).
- Shared factories and helpers go in `src/test/testHelpers.ts`.

## File Organization

```
src/store/       -- Zustand store (index.ts) and selectors (selectors.ts)
src/components/  -- React components
src/services/    -- API/storage services (shareStorage, crypto, handleStore, fileSystem)
src/utils/       -- Pure utility functions
src/types/       -- TypeScript type definitions (tab.ts, share.ts, fileTree.ts, criticmarkup.ts)
src/test/        -- Test files and helpers
```
