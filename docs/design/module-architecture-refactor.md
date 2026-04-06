# Module Architecture Refactor

## 1. Goal

Replace the current horizontal architecture:

- `src/store/index.ts` as the primary home for feature logic
- `src/services/*` as a shared side-effect bucket

with a vertical module architecture where each module owns one product concept end-to-end, excluding UI.

This refactor is about maintainability, testability, and ownership. It is not intended to change product behavior in the first pass.

## 2. Problem Statement

The current store has become a god object.

Symptoms:

- [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts) mixes persistent state, state mutation, network calls, filesystem calls, share orchestration, relay orchestration, and migration logic.
- `src/services/*` contains side effects, but responsibility boundaries are weak and feature logic still leaks back into the store.
- Host mode and peer mode logic live in the same file, which makes it easy to accidentally couple unrelated flows.
- Feature tests often need the full store because smaller units are not clearly isolated.

The result is that changes become risky, local reasoning gets harder, and feature ownership is unclear.

## 3. Target Architecture

The new unit of ownership is a module.

Each module owns:

- state shape for its domain
- pure state transitions
- selectors
- side-effect orchestration for that domain
- persistence/network adapters for that domain
- a short README that explains what it owns and what it does not own

UI stays outside modules.

The central store remains, but only as a composition layer.

## 4. Module Shape

Each module lives under `src/modules/<module>/`.

Recommended structure:

```text
src/modules/<module>/
  README.md
  index.ts
  types.ts
  state.ts
  selectors.ts
  controller.ts
  storage.ts
  test/
```

Notes:

- `storage.ts` exists only when the module talks to network, browser storage, or the local file system.
- Some modules may need an additional `guards.ts` or `helpers.ts`, but those stay module-local unless deliberately exported from `index.ts`.
- `test/` is for module-owned tests only: state, selectors, controllers, storage, and module orchestration.
- Tests whose primary subject is a UI component live next to that component under `src/ui/components/*`.
- Shared test setup and factories live under `src/testing/*`; there is no shared root test folder.

## 5. File Responsibilities

### `state.ts`

Pure state transitions only.

Allowed:

- object updates
- reducers
- merge helpers
- domain validation that does not depend on I/O

Not allowed:

- `fetch`
- `WebSocket`
- `localStorage`
- `IndexedDB`
- file system access
- DOM access

### `selectors.ts`

Read-only derived accessors for that module.

### `controller.ts`

Side-effect orchestration for the module.

Allowed:

- network calls
- file system calls
- relay calls
- dispatching module state actions
- calling other modules through their public APIs

Not allowed:

- direct mutation of another module's internals

### `storage.ts`

I/O adapter for that module only.

Examples:

- Worker HTTP wrapper
- local persistence adapter
- file session persistence adapter

### `index.ts`

The only public surface of the module.

All cross-module imports must go through `index.ts`.

## 6. Central Store Role

After the refactor, [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts) should do only four jobs:

1. compose module state into `AppState`
2. compose module action factories into the Zustand store
3. define persist behavior
4. define migrations

It should stop being a place where feature logic lives.

## 7. Proposed Modules

### `app-shell`

Purpose:

- application-level UI state that is not tied to host content, peer review, sharing, or relay transport

Owns:

- `theme`
- `toast`
- `focusMode`
- `presentationMode`

Current actions:

- `setTheme`
- `toggleFocusMode`
- `enterPresentationMode`
- `exitPresentationMode`
- `showToast`
- `dismissToast`

### `workspace`

Purpose:

- host-side tab and file-session lifecycle

Owns:

- `tabs`
- `activeTabId`
- file handles
- directory handles
- file tree
- active file path
- restore/open/refresh behavior

Current actions:

- tab creation/removal/selection
- file/folder open
- `restoreTabs`
- `refreshFile`
- `refreshFileTree`
- sidebar state

### `host-review`

Purpose:

- host review state for local markdown content

Owns:

- `rawContent`
- `comments`
- `resolvedComments`
- `commentPanelOpen`
- `commentFilter`
- `activeCommentId`
- undo state
- write permission state

Current actions:

- host comment scanning
- comment selection/filtering
- comment merge into host content
- host review panel behavior

### `sharing`

Purpose:

- host share lifecycle and unresolved incoming peer review state

Owns:

- `shares`
- `shareKeys`
- `activeDocId`
- `sharedPanelOpen`
- `pendingComments`
- `pendingResolveCommentIds`

Current actions:

- `shareContent`
- `revokeShare`
- `restoreShareSessions`
- `toggleSharedPanel`
- `addPendingComment`
- `replaceCommentsSnapshot`
- `queuePendingResolve`
- `confirmPendingResolve`
- `flushPendingCommentResolves`

### `peer-review`

Purpose:

- peer-mode shared content and peer comment draft/submission state

Owns:

- `sharedContent`
- `peerShareKeys`
- `peerActiveDocId`
- `peerRawContent`
- `peerFileName`
- `peerActiveFilePath`
- `peerComments`
- `peerResolvedComments`
- `peerCommentPanelOpen`
- `myPeerComments`
- `submittedPeerCommentIds`
- `peerName`

Current actions:

- `loadSharedContent`
- `selectPeerFile`
- `postPeerComment`
- `editPeerComment`
- `deletePeerComment`
- `confirmPeerCommentSubmitted`
- `syncPeerComments`

### `relay`

Purpose:

- relay runtime state and relay orchestration

Owns:

- `relayStatus`
- `documentUpdateAvailable`

Current actions:

- `setRelayStatus`
- `setDocumentUpdateAvailable`
- `dismissDocumentUpdate`

Owns side effects:

- socket lifecycle
- subscribe/unsubscribe
- reconnect
- frame handling
- resend behavior

## 8. Dependency Rules

These rules are the main reason for doing the refactor. Without them, modules become folder-shaped wrappers around the same coupling problem.

### Rule 1: Modules export a strict public API

Other code may import from:

- `src/modules/<module>/index.ts`

Other code may not import from:

- `state.ts`
- `controller.ts`
- `storage.ts`
- `helpers.ts`

unless the import stays inside the same module.

### Rule 2: `state.ts` stays pure

No side effects in `state.ts`.

### Rule 3: Cross-module coordination goes through public APIs

Bad:

- `sharing/controller.ts` importing `peer-review/state.ts`
- `relay/controller.ts` mutating store paths owned by another module

Good:

- `sharing` calling exported `peer-review` actions
- `relay` dispatching exported `sharing` or `peer-review` events

### Rule 4: UI imports module APIs, not store internals

Components should stop importing a large set of root store actions directly where a module-level API is more appropriate.

### Rule 5: Persistence and migrations stay centralized until explicitly moved

Persist shape and migration execution stay in the central store during the first refactor pass.

This avoids compatibility regressions while the architecture is changing.

## 9. README Template

Each module needs a short `README.md`.

Required sections:

- Purpose
- Owns
- Does not own
- State
- Public API
- Side effects
- Related docs
- Invariants
- Common failure modes

Example:

```md
# sharing

## Purpose
Owns host-side share lifecycle and unresolved peer review state.

## Owns
- share records
- share keys
- pending peer comments
- queued resolve ids

## Does not own
- websocket lifecycle
- host file parsing
- peer draft comments

## Related docs
- docs/features/realtime-comments/spec.md
- docs/features/realtime-comments/technical-design.md
```

## 10. Refactor Strategy

This should happen in two explicit passes.

### Pass 1: Structural extraction

Goal:

- move code into modules without changing behavior

Rules:

- keep current public store API stable
- move pure helpers first
- move selectors next
- move action factories next
- keep `persist` and migrations in the root store

This pass is mainly about ownership boundaries and file layout.

### Pass 2: Responsibility cleanup

Goal:

- move side effects out of store actions into module controllers

Rules:

- state transitions stay in `state.ts`
- orchestration moves into `controller.ts`
- UI calls controllers or thin store-bound wrappers

This pass is where the god-object behavior is actually removed.

## 11. Recommended Extraction Order

Extract the safest modules first:

1. `app-shell`
2. `relay`
3. `peer-review`
4. `sharing`
5. `workspace`
6. `host-review`

Reasoning:

- `app-shell` has low coupling and gives an easy first win
- `relay` has clear boundaries and already behaves like a service/controller pair
- `peer-review` is easier to isolate than host-mode file review
- `workspace` and `host-review` are the most coupled parts of the current store and should move later

## 12. Risks

### Hidden coupling

Some actions currently reach across host mode, peer mode, sharing, and relay concerns. The extraction will expose coupling that is currently hidden by the god-store structure.

### Persist compatibility

Changing state ownership too early can break migration behavior or persisted session restore.

### Circular imports

If modules import each other's internals, the new layout will be worse than the old one.

### False progress

Moving code into new files without changing responsibilities will reduce file size but not improve architecture.

## 13. Success Criteria

The refactor is successful when:

- [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts) is primarily composition and migration code
- feature logic lives in `src/modules/*`
- each module has a readable README and a small public API
- store actions stop being the main side-effect layer
- feature tests can target module behavior directly instead of always booting the entire app store

## 14. Out Of Scope

This refactor does not aim to:

- change product behavior in the first pass
- replace Zustand
- move UI components into modules
- redesign host mode vs peer mode state shapes immediately
- remove compatibility/migration logic without explicit approval
