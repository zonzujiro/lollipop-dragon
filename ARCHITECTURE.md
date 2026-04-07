# Architecture

This document describes the current runtime architecture of Lollipop Dragon.

It is meant to be the quickest way to understand how the app is organized
today.

## Runtime Modes

The app has two runtime modes with separate sources of truth:

- Host mode: the user opens local files or folders. State lives in `tabs[]`, and
  each tab owns its own file session and host review state.
- Peer mode: the user opens a shared link. State lives at the store root in
  `peer*` fields and does not use tabs.

`isPeerMode` determines which mode is active.

This separation is one of the most important architectural constraints in the
project. Components and actions must read from the correct state source for the
current mode.

## Main Layers

### UI

UI lives under `src/ui/`.

Components render application state and trigger store actions, but they do not
own domain state or cross-feature orchestration.

Components that work in both modes receive a `peerMode` prop and must branch
before reading state.

### Store

The central Zustand store lives in `src/store/index.ts`.

The store is a composition layer. Its responsibilities are:

1. compose module state into `AppState`
2. compose module action factories
3. define persistence behavior
4. define migrations

Feature logic should not accumulate in the root store.

### Modules

Feature logic lives under `src/modules/*`.

Each module owns one product concept end-to-end, excluding UI. `index.ts` is
the default module entrypoint.

Shared module shape:

- `state.ts`: pure state transitions only
- `selectors.ts`: read-only derived accessors
- `controller.ts`: side-effect orchestration
- `storage.ts`: module-local I/O adapter when needed
- `types.ts`: module-owned types
- `test/`: module-focused tests
- `README.md`: ownership and invariants

### Lower-Level Helpers

Lower-level reusable code lives outside modules:

- `src/services/`: browser, network, crypto, and file-system adapters
- `src/markup/`: CriticMarkup parsing and editing helpers
- `src/types/`: shared application types
- `src/utils/`: generic pure helpers

These support modules, but should not become a second home for feature
ownership.

## State Model

### Host Mode

Host mode state is tab-scoped.

Each `TabState` may include:

- file or directory session handles
- file tree and active file path
- raw markdown content
- host review comments and filters
- share state for that tab

Host mode access should go through workspace selectors such as `getActiveTab`,
`useActiveTab`, and `useActiveTabField`.

### Peer Mode

Peer mode state lives at the store root.

This includes:

- loaded shared content
- active peer file selection
- peer comments and resolved comments
- peer draft comments
- submitted peer comment ids
- peer name and panel state

Peer mode should read directly from root `peer*` fields, not from tabs.

## Module Ownership

### `app-shell`

Owns application-level shell state:

- theme
- toast
- focus mode
- presentation mode

### `workspace`

Owns host-side file session lifecycle:

- tabs
- active tab
- open and restore flows
- history
- file tree and active file selection

### `host-review`

Owns host-side review state over local markdown:

- comments
- resolved comments
- active comment selection
- comment filters and panel state
- undo and write permission state

### `sharing`

Owns host-side sharing lifecycle:

- share records and keys
- active share selection
- pending incoming peer comments
- queued resolve ids

### `peer-review`

Owns peer-mode shared content and peer-authored comment flows:

- peer shared content
- peer comments
- draft comments
- submitted comment tracking
- peer name and peer panel state

### `relay`

Owns relay transport runtime:

- relay status
- document update availability
- subscribe and unsubscribe orchestration
- reconnect and resend behavior

## Controller vs State

This project now draws a hard line between pure state updates and side effects.

`state.ts` may do:

- object updates
- reducer-style transforms
- pure validation and merge logic

`state.ts` may not do:

- DOM access
- network calls
- localStorage or IndexedDB access
- file system access
- timers

`controller.ts` owns orchestration such as:

- file reads and writes
- share upload and revoke
- relay subscription and message handling
- fullscreen entry
- sequencing calls across module APIs

## Cross-Module Rules

- Prefer importing modules through `src/modules/<module>/index.ts`.
- Narrow leaf imports such as `types.ts` or `selectors.ts` are acceptable when
  they are intentionally lightweight and help avoid circular dependencies.
- Modules may call other modules through their public APIs.
- Modules must not mutate another module's internal store paths directly.
- UI should prefer module APIs and selectors over reaching into unrelated store
  internals.

## Module Documentation

Each module should keep a short `README.md` that explains:

- purpose
- what the module owns
- what it does not own
- public API
- side effects
- invariants
- common failure modes

The goal is to make ownership discoverable without sending readers through the
entire store.

## Typical Flows

### Host Flow

1. Workspace opens or restores a file or folder.
2. Host review derives comments for the active content.
3. Sharing can publish that tab's content and track incoming peer comments.
4. Relay keeps shared documents in sync in the background.

### Peer Flow

1. Peer review loads shared content from a share link.
2. Relay subscribes the peer to live updates for that document.
3. Peer review manages local drafts and submitted comment state.
4. Sharing and relay coordinate delivery and resolve acknowledgements on the host.

## Persistence

Persistence remains centralized in the root store for now.

The persisted store contains app state and migrations, while mutable runtime
objects such as WebSocket instances, timers, and DOM references stay outside the
store.

Modules may own their own local persistence adapters when the persistence is
part of the feature itself, such as share records or file-session handles.

Backward-compatibility logic for persisted state should stay intentional.
Migrations and legacy restore behavior should not be removed casually.

## Testing Boundaries

Prefer testing behavior at the module boundary when possible:

- module state tests for pure transitions
- module controller tests for orchestration
- UI tests for rendering and interaction

Whole-store tests are still useful for integration flows, but they should not be
the default way to verify module behavior.

## Where To Start

If you are new to the codebase, read in this order:

1. `ARCHITECTURE.md`
2. `docs/contributing.md`
3. the relevant module README under `src/modules/*/README.md`
4. feature specs or technical designs in `docs/`
