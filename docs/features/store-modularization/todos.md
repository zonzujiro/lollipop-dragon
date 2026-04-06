# Todos - Store Modularization

> Design: [../../design/module-architecture-refactor.md](../../design/module-architecture-refactor.md)

## Goal

Split the current store/services architecture into vertical modules under `src/modules/*`, while keeping behavior stable during the first pass.

The first pass is structural. It should reduce coupling and make ownership explicit without changing product behavior.

## Phase 1 - Foundation

### Task 1: Create module directories and README stubs

Files:

- create `src/modules/app-shell/`
- create `src/modules/workspace/`
- create `src/modules/host-review/`
- create `src/modules/sharing/`
- create `src/modules/peer-review/`
- create `src/modules/relay/`

Steps:

- [x] Add `README.md` to each module using the standard template from the design doc
- [x] Add empty `index.ts`, `types.ts`, `state.ts`, and `selectors.ts` to each module
- [x] Add `controller.ts` only where the module already owns side effects

Verification:

- all module folders exist
- each module has a README that clearly states ownership boundaries

### Task 2: Reduce the root store to a composition target

Files:

- modify [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts)

Steps:

- [ ] Identify all root-level state groups and map each field to a target module
- [ ] Add section comments or temporary grouping helpers that match the target modules
- [ ] Extract non-module-specific helper functions into pure helpers where needed

Verification:

- field ownership map is explicit
- no new feature logic is added to the root store during this refactor

## Phase 2 - Low-risk module extraction

### Task 3: Extract `app-shell`

Files:

- create files in `src/modules/app-shell/`
- modify [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts)

Owns:

- `theme`
- `toast`
- `focusMode`
- `presentationMode`

Steps:

- [x] Move types and selectors into the module
- [x] Move pure actions into `state.ts`
- [x] Re-export public API from `index.ts`
- [x] Replace direct root-store definitions with module composition

Verification:

- no behavior changes
- UI imports still work through stable store bindings or module exports

### Task 4: Extract `relay`

Files:

- create files in `src/modules/relay/`
- modify [src/services/relay.ts](/home/zonzujiro/projects/lollipop-dragon/src/services/relay.ts)
- modify [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts)

Owns:

- `relayStatus`
- `documentUpdateAvailable`
- relay runtime orchestration

Steps:

- [x] Move relay-owned selectors and state transitions into the module
- [x] Keep socket runtime in the module controller
- [x] Export relay event handlers through the module public API
- [x] Stop treating relay orchestration as a generic shared service

Verification:

- reconnect, subscribe, and status updates behave exactly as before

### Task 5: Extract `peer-review`

Files:

- create files in `src/modules/peer-review/`
- modify [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts)
- modify [src/store/selectors.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/selectors.ts)

Owns:

- peer mode document state
- peer draft comments
- submitted peer comment IDs
- peer name

Steps:

- [x] Move peer selectors into module selectors
- [x] Move peer draft and submission transitions into module state
- [x] Keep share-content loading orchestration behind a module controller
- [x] Preserve current peer-mode behavior and persisted shape

Verification:

- peer document load works
- peer drafts still submit through the current flow
- peer reconnect resend behavior is unchanged

## Phase 3 - Medium-risk module extraction

### Task 6: Extract `sharing`

Files:

- create files in `src/modules/sharing/`
- modify [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts)
- modify [src/services/shareSync.ts](/home/zonzujiro/projects/lollipop-dragon/src/services/shareSync.ts)
- modify [src/services/shareStorage.ts](/home/zonzujiro/projects/lollipop-dragon/src/services/shareStorage.ts)

Owns:

- share records
- share keys
- shared panel state
- pending incoming peer comments
- queued resolve IDs

Steps:

- [ ] Move pure pending-comment transitions into module state
- [ ] Move share storage calls behind a module controller
- [ ] Keep durable resolve behavior unchanged
- [ ] Expose a narrow public API for share lifecycle commands

Verification:

- share create/revoke/update still work
- host pending comments still restore from relay snapshots
- queued resolve flow still works

### Task 7: Extract `workspace`

Files:

- create files in `src/modules/workspace/`
- modify [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts)
- modify file/session services as needed

Owns:

- tabs
- active tab
- file handles
- directory handles
- file tree
- restore/open/refresh orchestration

Steps:

- [ ] Move tab lifecycle state and selectors into the module
- [ ] Move file-session orchestration into the module controller
- [ ] Keep restore behavior and persisted-state compatibility stable

Verification:

- open file/folder still works
- restore flow still works
- refresh and file-tree rebuild still work

## Phase 4 - High-risk extraction

### Task 8: Extract `host-review`

Files:

- create files in `src/modules/host-review/`
- modify [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts)

Owns:

- host review comments
- merge behavior
- resolved comments
- undo/write state
- host review panel state

Steps:

- [ ] Move pure review-state transitions into the module
- [ ] Split merge orchestration from state mutation
- [ ] Preserve current write/update behavior

Verification:

- host comment merge still writes expected content
- undo behavior still works
- comment panel behavior is unchanged

## Phase 5 - Responsibility cleanup

### Task 9: Move side effects out of store-owned action bodies

Files:

- all affected `src/modules/*/controller.ts`
- [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts)

Steps:

- [ ] Audit store actions that still perform network/filesystem/DOM side effects
- [ ] Move those side effects into module controllers
- [ ] Leave only state transitions and thin dispatch wrappers in store-owned action factories

Verification:

- `state.ts` files are pure
- most side effects live in controllers
- root store is primarily composition

### Task 10: Delete obsolete horizontal helpers

Files:

- [src/store/selectors.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/selectors.ts)
- [src/services/*](/home/zonzujiro/projects/lollipop-dragon/src/services/)
- [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts)

Steps:

- [ ] remove helpers that became module-local
- [ ] remove stale cross-feature services after their responsibilities are moved into modules
- [ ] keep only genuinely shared primitives in top-level `src/services/`

Verification:

- shared folders contain shared primitives, not feature-specific god-services
- no module imports another module's internals

## Phase 6 - Verification and cleanup

### Task 11: Add module-level tests

Files:

- `src/modules/*/test/`

Steps:

- [ ] add focused tests for each extracted module
- [ ] stop relying only on whole-app store tests where a module test is sufficient

Verification:

- module behavior can be tested directly
- whole-store tests remain only for cross-module integration

### Task 12: Update module READMEs as ownership stabilizes

Files:

- `src/modules/*/README.md`

Steps:

- [ ] document final public APIs
- [ ] document invariants and common failure modes
- [ ] link related product and design docs

Verification:

- each module README matches shipped ownership

## Guardrails

- [ ] Do not change persisted-state compatibility unless explicitly required
- [ ] Do not remove old migration logic without approval
- [ ] Do not change host vs peer product behavior during structural extraction
- [ ] Do not create cross-module imports into module internals
- [ ] Do not leave side effects inside `state.ts`

## Definition Of Done

- [ ] `src/modules/*` owns feature logic
- [ ] [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts) is primarily composition and migration code
- [ ] feature-specific side effects live in module controllers
- [ ] each module has a README
- [ ] tests exist at the module boundary, not only at whole-store level
