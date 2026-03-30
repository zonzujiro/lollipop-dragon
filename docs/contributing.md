# Contributing

## Prerequisites

- Node.js 18+
- Yarn 4 (`corepack enable && corepack prepare yarn@4.12.0`)
- Chrome or Edge (for testing host mode — requires File System Access API over HTTPS/localhost)

## Setup

```bash
yarn install
yarn dev          # starts dev server at http://localhost:5173
```

To enable sharing features locally:

```bash
VITE_WORKER_URL=https://your-worker.dev yarn dev
```

## Development workflow

1. Create a branch from `main` with a descriptive prefix: `feat/`, `fix/`, `refactor/`, `docs/`
2. Make changes, ensure tests pass (`yarn test`) and types check (`npx tsc --noEmit`)
3. Commit with a concise message: `feat: add slide counter to presentation mode`
4. Push and open a PR against `main`

Pre-commit hooks (Husky + lint-staged) will auto-format staged files with Prettier.

## Code conventions

### TypeScript

- **Never use `as` for type assertions.** Use type guards, proper narrowing, or helper functions.
- Prefer `async/await` over `.then()` where possible. Exception: `useEffect` callbacks can't be async, so `.then()` is acceptable there.
- Prefer named boolean variables or small predicate helpers for non-trivial conditions instead of embedding complex checks inline.

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

### Keep it simple

- Only make changes that are directly requested or clearly necessary.
- Don't add error handling for scenarios that can't happen.
- Don't create abstractions for one-time operations.
- Don't add comments, docstrings, or type annotations to code you didn't change.

## Testing

```bash
yarn test              # run all tests once
yarn test:watch        # watch mode
yarn test:coverage     # with coverage report
```

### Coverage thresholds

- Lines / Functions / Statements: 60%
- Branches: 70%

### Test helpers

Tests use helpers from `src/test/testHelpers.ts`:

- `setTestState(tabOverrides, globalOverrides)` — sets up a test tab as active and merges overrides.
- `resetTestStore()` — resets to a clean state. Call in `beforeEach`.

### Mocking

- Use top-level `vi.mock()` for module mocks — Vitest hoists these before imports, so dynamic `import()` in tests is unnecessary.
- Shared factories and helpers go in `src/test/testHelpers.ts`.

## Browser testing

- **Host mode** requires Chrome or Edge over HTTPS (localhost works). The File System Access API is not available in Firefox or Safari.
- **Peer mode** works in any modern browser.
- The experimental `FileSystemObserver` API (auto-refresh on external file changes) only works in Chrome. When unavailable, or when the observer errors out, the app falls back to polling (every 5s for directory trees, every 2s for open files). The observer also handles `"unknown"` records (missed events) by triggering an immediate rescan.

## Architecture reference

- [CLAUDE.md](../CLAUDE.md) — state management rules, component conventions, common pitfalls
- [docs/](../docs/) — feature specs, technical designs, iteration roadmap

Read these before making architectural decisions or adding features.
