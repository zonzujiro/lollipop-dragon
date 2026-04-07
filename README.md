# [Lollipop Dragon](https://critiq.ink/)

A browser-based platform for reviewing markdown documents. Open local files and folders, annotate them with [CriticMarkup](https://criticmarkup.com/) comments, share encrypted snapshots with peers, and present content as slideshows without leaving the browser.

Comments live directly in the markdown using CriticMarkup syntax, so any LLM can read and act on them naturally. No sidecar files, no export steps, no sync issues.

## Features

- **Rich markdown rendering** - GFM tables, task lists, syntax-highlighted code (Shiki), Mermaid diagrams
- **CriticMarkup comments** - 7 semantic types (fix, rewrite, expand, clarify, question, remove, note) stored inline in the file
- **Two collaboration flows** - peer sharing (encrypted, no accounts) and AI collaboration (LLM reads and writes CriticMarkup directly)
- **Realtime peer review** - peers submit comments through the relay, hosts receive them live, and unresolved comments survive reconnects
- **Folder browsing** - open entire directories, navigate via file tree sidebar, comment across files
- **Tabs** - open multiple files and folders in tabs, with keyboard shortcuts to switch and close them
- **Presentation mode** - splits markdown by `#` headings or `---` dividers into a fullscreen slideshow
- **Focus mode** - hide the app chrome and keep only the rendered document
- **Light/dark theme**
- **File watching** - auto-refresh on external changes when the browser supports the required APIs

## Requirements

**Host mode** (opening local files): Chrome or Edge, served over HTTPS (localhost is fine). Requires the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API).

**Peer mode** (viewing shared links): any modern browser.

## Getting started

```bash
yarn install
yarn dev
```

To enable peer sharing locally:

```bash
VITE_WORKER_URL=https://your-worker.dev yarn dev
```

`VITE_WORKER_URL` may include a trailing slash. The app normalizes it before building `/share` and `/relay` URLs.

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Start the Vite dev server |
| `yarn build` | Type-check and build for production |
| `yarn preview` | Preview the production build locally |
| `yarn test` | Run all tests once |
| `yarn test:watch` | Run tests in watch mode |
| `yarn test:coverage` | Run tests with coverage |
| `yarn lint` | Run ESLint |
| `yarn deploy:worker` | Deploy the Cloudflare Worker |

## Project structure

```text
src/
  components/         React components (folder-per-component)
  modules/            Vertical feature modules
  store/              Zustand composition root and compatibility selectors
  services/           Low-level adapters and shared integrations
  types/              TypeScript type definitions
  utils/              Pure utility helpers
  styles/             Global CSS (tokens, reset, layout, landing page)
  test/               Component tests and shared test helpers

worker/               Cloudflare Worker for encrypted share storage and relay-backed peer comments
docs/                 Contributing guide, feature specs, and architecture notes
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| UI | React 19, TypeScript |
| Build | Vite 6 |
| State | Zustand 5 with persist middleware |
| Markdown | react-markdown, remark-gfm, unified |
| Syntax highlighting | Shiki 4 |
| Diagrams | Mermaid 11 |
| Testing | Vitest, Testing Library |
| Sharing backend | Cloudflare Worker + KV + SQLite-backed Durable Objects |
| Deployment | GitHub Pages (static), Cloudflare Worker (API) |

## Architecture

The app has two runtime modes with separate state:

- **Host mode** - the user opens local files and folders. State lives in `TabState` objects inside `tabs[]`. Each tab owns its file data, comments, share state, and host-side UI state.
- **Peer mode** - the user opens a shared link. State lives at the store root as `peer*` fields. Peer mode does not use tabs.

The `isPeerMode` flag determines which mode is active. Components that work in both modes receive a `peerMode` prop and read from the correct state source.

The codebase is being organized into vertical modules under `src/modules/*`, with the root store acting as a composition layer instead of the main home for feature logic.

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [docs/contributing.md](./docs/contributing.md) for development conventions and module boundaries.

## Sharing

Peer sharing uses end-to-end encryption:

1. Host generates an AES-256 key in the browser.
2. The document tree is encrypted client-side and uploaded to the Cloudflare Worker.
3. The Worker stores encrypted document content in KV and unresolved peer comments in a SQLite-backed Durable Object relay.
4. The share link includes the decryption key in the URL hash, so it never reaches the server.
5. The peer decrypts locally, drafts comments locally, and submits them through the relay.
6. The host receives submitted peer comments live and can merge or dismiss them locally.

No accounts, no plaintext on the server. The Worker sees encrypted payloads and share metadata only.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_WORKER_URL` | No | Cloudflare Worker URL. If unset, sharing features are hidden. |

## License

Private.
