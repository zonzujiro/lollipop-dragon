# Contributing

## Prerequisites

- Node.js 22+
- npm 11+
- Chrome or Edge (for testing host mode — requires File System Access API over HTTPS/localhost)
- Rust and Tauri v2 platform prerequisites for desktop shell development

## Setup

```bash
npm install
npm run dev          # starts dev server at http://localhost:5173
```

Desktop development must run on the native target OS. For Windows desktop work,
use the Windows checkout and Windows toolchain:

```powershell
cd C:\Users\ivan\Projects\lollipop-dragon
npm install
npm run desktop:dev
```

For the WSL checkout at `/home/zonzujiro/projects/lollipop-dragon`, run web,
test, typecheck, and lint commands through WSL. Do not use WSL desktop runs as
Windows UX validation; `npm run desktop:dev` from WSL runs the Linux Tauri app
through WSLg.

To enable sharing features locally:

```bash
VITE_WORKER_URL=https://your-worker.dev npm run dev
```

`VITE_WORKER_URL` may include a trailing slash. The app normalizes it before building `/share` and `/relay` URLs.

## Development workflow

1. Create a branch from `main` with a descriptive prefix: `feat/`, `fix/`, `refactor/`, `docs/`
2. Run `npm run preflight:agent`, make the change, and finish with `npm run validate`
3. Commit with a concise message: `feat: add comment filter shortcuts`
4. Push and open a PR against `main`

Pre-commit hooks auto-format staged files, then run zero-warning lint, frontend
and Worker typechecks, and architecture validation. Pull-request CI repeats the
complete validation from a clean install.

### Validation commands

```bash
npm run preflight:agent   # format, lint, both typechecks, architecture, tests
npm run validate          # preflight plus production build and bundle budget
npm run architecture:check
npm run bundle:check      # run after npm run build
```

Do not add inline suppressions to bypass a validator. A legitimate exception
must be documented in the owning architecture/module document with an owner,
reason, and removal condition.

## Code conventions

### TypeScript

- **Never use `as` for type assertions.** Use type guards, proper narrowing, or helper functions.
- Prefer `async/await` over `.then()` where possible. Exception: `useEffect` callbacks can't be async, so `.then()` is acceptable there.
- Prefer named boolean variables or small predicate helpers for non-trivial conditions instead of embedding complex checks inline.
- Prefer no more than 4 parameters in new or refactored functions. If a function needs more context, pass a named object instead.
- **No `switch`/`case`.** Use object maps (e.g., `Record<Type, Handler>`) for dispatch instead.
- **No single-letter variable names.** Use descriptive names — `comment` not `c`, `state` not `s`, `error` not `e`.
- **Avoid runtime type checks to satisfy TypeScript.** Parse and validate external data (JSON, network) once at the boundary into typed structures. Don't scatter `typeof x === "string"` checks through business logic.

### Compatibility

- If a change may remove backward-compatibility logic, stop and confirm first. Do not remove migrations, persisted-state compatibility, or legacy restore paths without explicit approval.

### Components

Each component lives in its own folder:

```
src/components/MyComponent/
  MyComponent.tsx    # component code
  MyComponent.css    # scoped styles
  index.ts           # barrel export
```

If a component has local helpers too large for the main file, place them in the same folder (or nested subfolders).

Import components through barrel files:

```ts
import { MyComponent } from "../MyComponent"; // resolves to index.ts
```

Production React component files are capped at 500 lines by architecture
validation. This is an absolute ceiling, not a target. Split models,
interaction hooks, rendering adapters, and leaf UI before reaching it; do not
raise the limit to land a feature.

### CSS

- Component styles go in the component folder (`MyComponent.css`), imported at the top of the `.tsx` file.
- Global styles (tokens, reset, layout) live in `src/styles/`.
- Design tokens are CSS custom properties defined in `src/styles/tokens.css`.
- Dark mode: use `.dark` class overrides in the component's own CSS file.

### State management

The app has two runtime modes with **completely separate state** — read [CLAUDE.md](../CLAUDE.md) for the full breakdown. The short version:

- **Host mode**: state lives in `TabState` objects. Access via `useActiveTab()` or `useActiveTabField(field)`.
- **Peer mode**: state lives at the store root as `peer*` fields. Access via `useAppStore(s => s.peerField)`.
- Components that work in both modes receive a `peerMode` prop. Never mix state sources.

When adding new state, decide whether it belongs on `TabState` (host-only) or `AppState` root (peer/global).

**Store holds data only.** Do not put mutable non-serializable objects (WebSocket connections, timers, DOM refs) in the Zustand store. Keep them as module-level singletons in services.

### Keep it simple

- Only make changes that are directly requested or clearly necessary.
- Don't add error handling for scenarios that can't happen.
- Don't create abstractions for one-time operations.
- Don't add comments, docstrings, or type annotations to code you didn't change.

## Testing

```bash
npm test                    # run all tests once
npm run test:watch          # watch mode
npm run test:coverage       # with coverage report
```

Security boundaries need hostile-input regression tests. In particular,
changes to Markdown or Mermaid rendering must prove scripts, event attributes,
external SVG resources, and unsafe URLs remain inert for peer-link content.

### Coverage thresholds

- Lines / Functions / Statements: 60%
- Branches: 70%
- Relay, sharing, and workspace have explicit ratchet floors in
  `vite.config.ts`; do not lower them. Raise the relevant floor when critical
  controller coverage improves.

Vitest rejects unexpected stderr, including React `act()` warnings. Tests that
intentionally exercise an error path must spy on the expected console call and
assert its context, so a green run remains quiet and meaningful.

### Test helpers

Tests use helpers from `src/testing/testHelpers.ts`:

- `setTestState(tabOverrides, globalOverrides)` — sets up a test tab as active and merges overrides.
- `resetTestStore()` — resets to a clean state. Call in `beforeEach`.

### Mocking

- Use top-level `vi.mock()` for module mocks — Vitest hoists these before imports, so dynamic `import()` in tests is unnecessary.
- Shared factories and helpers go in `src/testing/testHelpers.ts`.

## Browser testing

- **Host mode** requires Chrome or Edge over HTTPS (localhost works). The File System Access API is not available in Firefox or Safari.
- **Peer mode** works in any modern browser.
- The experimental `FileSystemObserver` API (auto-refresh on external file changes) only works in Chrome. When unavailable, or when the observer errors out, the app falls back to polling (every 5s for directory trees, every 2s for open files). The observer also handles `"unknown"` records (missed events) by triggering an immediate rescan.

## Architecture reference

- [ARCHITECTURE.md](../ARCHITECTURE.md) — current runtime architecture and ownership map
- [CLAUDE.md](../CLAUDE.md) — state management rules, component conventions, common pitfalls
- [docs/](../docs/) — feature specs, technical designs, iteration roadmap

Read these before making architectural decisions or adding features.
