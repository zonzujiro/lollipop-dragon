# [Lollipop Dragon](https://critiq.ink/)

A browser-based platform for reviewing LLM-generated research documents. Open local markdown files, annotate them with [CriticMarkup](https://criticmarkup.com/) comments, share encrypted snapshots with peers, and present content as slideshows — all without leaving the browser.

Comments live directly in the markdown using CriticMarkup syntax, so any LLM can read and act on them naturally. No sidecar files, no export steps, no sync issues.

## Features

- **Rich markdown rendering** — GFM tables, task lists, syntax-highlighted code (Shiki), Mermaid diagrams
- **CriticMarkup comments** — 7 semantic types (fix, rewrite, expand, clarify, question, remove, note) stored inline in the file
- **Two collaboration flows** — peer sharing (encrypted, no accounts) and AI collaboration (LLM reads/writes CriticMarkup directly)
- **Folder browsing** — open entire directories, navigate via file tree sidebar, comment across files
- **Tabs** — open multiple files/folders in tabs, keyboard shortcuts to switch (Ctrl+Tab) and close (Cmd+W)
- **Presentation mode** — splits markdown by `# headings` or `---` dividers into a fullscreen slideshow
- **Focus mode** — hide all chrome, just the rendered document
- **Light/dark theme**
- **File watching** — auto-refresh on external changes (via experimental FileSystemObserver)

## Requirements

**Host mode** (opening local files): Chrome or Edge, served over HTTPS (localhost is fine). Requires the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API).

**Peer mode** (viewing shared links): any modern browser.

## Getting started

```bash
yarn install
yarn dev          # http://localhost:5173
```

To enable peer sharing, set the Cloudflare Worker URL:

```bash
VITE_WORKER_URL=https://your-worker.dev yarn dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Start dev server with HMR |
| `yarn build` | Type-check + production build |
| `yarn preview` | Preview the production build locally |
| `yarn test` | Run all tests once |
| `yarn test:watch` | Run tests in watch mode |
| `yarn test:coverage` | Run tests with coverage report |
| `yarn lint` | Run ESLint |
| `yarn deploy:worker` | Deploy the Cloudflare Worker |

## Project structure

```
src/
  components/         React components (folder-per-component)
    ComponentName/
      ComponentName.tsx
      ComponentName.css
      index.ts
  store/              Zustand store and selectors
  services/           CriticMarkup parser, file system, sharing, crypto, syntax highlighting
  types/              TypeScript type definitions
  utils/              Pure utility functions
  styles/             Global CSS (tokens, reset, layout, landing page)
  test/               Test files and helpers

worker/               Cloudflare Worker for encrypted share storage
docs/                 Product requirements, technical designs, roadmap
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| UI | React 19, TypeScript |
| Build | Vite 6 |
| State | Zustand 5 (with persist middleware) |
| Markdown | react-markdown, remark-gfm, unified |
| Syntax highlighting | Shiki 4 |
| Diagrams | Mermaid 11 |
| Testing | Vitest, Testing Library |
| Sharing backend | Cloudflare Worker + KV (AES-256 client-side encryption) |
| Deployment | GitHub Pages (static), Cloudflare Worker (API) |

## Architecture

The app has two runtime modes with completely separate state:

- **Host mode** — user opens local files/folders. State lives in `TabState` objects inside `tabs[]`. Each tab owns its file data, comments, and UI state.
- **Peer mode** — user opens a shared link. State lives at the store root as `peer*` fields. No tabs.

The `isPeerMode` flag determines which mode is active. Components that work in both modes receive a `peerMode` prop and read from the correct state source.

See [CLAUDE.md](./CLAUDE.md) for detailed development conventions.

## Sharing

Peer sharing uses end-to-end encryption:

1. Host generates an AES-256 key (Web Crypto API)
2. File tree is encrypted client-side and posted to the Cloudflare Worker
3. Worker stores the opaque blob in KV with a 7-day TTL
4. Share link includes the decryption key in the URL hash (never sent to the server)
5. Peer decrypts locally in the browser, can leave comments
6. Host pulls and merges peer comments back into the file

No accounts, no auth. The Worker never sees plaintext.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_WORKER_URL` | No | Cloudflare Worker URL. If unset, sharing features are hidden. |

## License

Private.
