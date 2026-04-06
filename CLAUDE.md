# Project Rules

## Before you start

Read the [contribution guide](./docs/contributing.md) and review the docs in [`docs/`](./docs/) (feature specs, technical designs, iteration roadmap) before making architectural decisions or adding features.

## TypeScript

- **Never use `as` for type assertions.** Use type guards, proper narrowing, or helper functions instead.
- **Always use braces `{}` for `if`/`else`/`for`/`while` blocks.** No single-line bodies without braces.
- **No IIFEs.** Extract async logic into named functions instead of `(async () => { ... })()`.
- **No `switch`/`case`.** Use object maps (e.g., `Record<Type, Handler>`) for dispatch instead.
- **No single-letter variable names.** Use descriptive names — `comment` not `c`, `state` not `s`, `error` not `e`.
- **Avoid runtime type checks to satisfy TypeScript.** Parse and validate external data (JSON, network) once at the boundary into typed structures. Don't scatter `typeof x === "string"` checks through business logic.

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

### Store actions must mutate state

- **Every store action must call `set()`.** Functions that only read state and perform side effects (downloads, DOM manipulation, network calls) do not belong in the store. Put them in `src/services/` and read state via `useAppStore.getState()`.

### Store holds data only

- **Do not put mutable non-serializable objects (WebSocket connections, timers, DOM refs) in the Zustand store.** Keep them as module-level singletons in services.

### When adding new state

- Decide whether it is tab-scoped or global. If it only matters in host mode, put it on `TabState`. If it only matters in peer mode or is truly global, put it on `AppState` root.
- Put shared selectors in `src/store/selectors.ts` to avoid logic duplication.

## Error Handling

- **Never swallow errors silently.** Empty `catch {}` blocks hide real bugs. Always log or re-throw. If an error is expected (e.g., optional API unavailable), log a warning with context.
- **Handle environment guards at the boundary, not at every call site.** If a service (e.g., IndexedDB) may be unavailable, make the service itself return a rejected promise or no-op — don't wrap every caller in try/catch.

## Styling

- **Always prefer CSS over JS for visual changes.** Use classes, data attributes, and CSS variables for styling, transitions, and conditional visuals. Inline styles via JS are a last resort — only use them when there is genuinely no CSS-only solution (e.g., values computed at runtime that cannot be expressed as CSS variables or attributes).

## Component Conventions

- Components that work in both modes (`CommentPanel`, `Header`, `CommentMargin`, `MarkdownRenderer`) receive a **`peerMode` prop**.
- In peer mode: read from global peer state (e.g., `useAppStore(s => s.peerActiveFilePath)`).
- In host mode: read from active tab via selectors (e.g., `useActiveTabField('activeFilePath')`).
- Never mix the two -- guard on `peerMode` before accessing state.

## Testing Patterns

- **`setTestState(tabOverrides, globalOverrides)`** from `src/testing/testHelpers.ts` -- sets up a test tab as active and merges global overrides.
- **`resetTestStore()`** -- resets to a clean state.
- Use top-level `vi.mock()` for module mocks (Vitest hoists these before imports).
- Shared factories and helpers go in `src/testing/testHelpers.ts`.

## File Organization

```
docs/            -- Contributing guide, iteration roadmap (read before building)
docs/features/   -- Feature specs and task lists
docs/design/     -- Technical design documents (v1, v2)
src/store/       -- Zustand store (index.ts) and selectors (selectors.ts)
src/ui/components/ -- React components (folder-per-component: Name/Name.tsx, Name.css, index.ts)
src/services/    -- API/storage services (shareStorage, crypto, handleStore, fileSystem)
src/utils/       -- Pure utility functions
src/types/       -- TypeScript type definitions (tab.ts, share.ts, fileTree.ts, criticmarkup.ts)
src/ui/styles/   -- Global CSS (tokens, reset, layout, landing page)
src/testing/     -- Shared test setup and factories (no test files)
```
