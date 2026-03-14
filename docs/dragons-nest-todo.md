# Dragon's Nest MCP — TODO

> Derived from [dragons-nest-mcp.md](./dragons-nest-mcp.md). Each task maps to a section in the tech design.

---

## Phase 1: Repository Setup

### 1.1 Create `dragons-nest` repo
- [x] Create GitHub repo `dragons-nest`
- [x] Initialize with TypeScript + Node.js (`package.json`, `tsconfig.json`)
- [x] Add `.gitignore` (node_modules, dist, .env, etc.)
- [x] Add `README.md` with repo purpose, structure overview, and setup instructions

### 1.2 Seed feature directories
> Tech design §7, §8. Populate `features/` with real lollipop-dragon features at varied statuses.

- [x] `features/criticmarkup-comments/` — status: **done**, owner: Alex
- [x] `features/peer-sharing/` — status: **done**, owner: Alex
- [x] `features/multi-tab/` — status: **done**, owner: Alex
- [x] `features/presentation-mode/` — status: **in-progress**, owner: Alex (with example decisions)
- [x] `features/realtime-collaboration/` — status: **planned**, owner: unassigned
- [x] `features/dragons-nest-mcp/` — status: **in-progress**, owner: Alex (with example decisions)

### 1.3 Write consolidation skill
> Tech design §9.2

- [x] `skills/consolidate.md` — Claude SDK system prompt for merging decisions into feature files

---

## Phase 2: MCP Server Core

### 2.1 Scaffold MCP server
> Tech design §7, §11

- [x] Create `server/` directory with `package.json` and `tsconfig.json`
- [x] Install dependencies: `@modelcontextprotocol/sdk`, `typescript`, `tsx`
- [x] Create `server/src/index.ts` — MCP server entry point with all 3 tools registered
- [x] Create `server/src/config.ts` — configuration constants (both repos, bundled files)
- [x] Build compiles cleanly, MCP handshake works

### 2.2 GitHub REST API client
> Tech design §5, §9, §10

- [x] `server/src/github.ts` with `readFile`, `writeFile`, `listDirectory`
- [x] Token from `process.env.GITHUB_TOKEN` with clear error if missing
- [x] Proper headers (`Accept`, `Authorization`, `X-GitHub-Api-Version`)
- [x] Rate limit warnings (check `X-RateLimit-Remaining`)
- [x] Error handling: 404, 401, 403, 409, generic errors with `GitHubError` class

### 2.3 Implement `list_features()`
> Tech design §6, §8.1. Corresponds to User Story 1.

- [x] No parameters, returns `Array<{ slug, status, owner }>`
- [x] Lists feature directories, reads each `index.md`, parses YAML front matter
- [x] Sorted by slug
- [x] Handles missing/malformed `index.md` gracefully (status: "unknown")

### 2.4 Implement `get_feature(slug)`
> Tech design §6, §10. Corresponds to User Story 2.

- [x] Parameter: `slug` (string, required)
- [x] Fetches all files in feature directory from hot storage
- [x] Bundles cold storage context: CLAUDE.md, iteration-roadmap.md
- [x] Attempts to find related tech design by slug
- [x] Clear error for non-existent features

### 2.5 Implement `update_feature(slug, section, content)`
> Tech design §6, §9, §9.1. Corresponds to User Story 3.

- [x] Parameters: `slug`, `section`, `content`
- [x] Appends timestamped entry to `decisions.md`
- [x] SHA conflict retry loop (max 3 retries)
- [x] Creates `decisions.md` if it doesn't exist (sha = null)
- [x] Returns commit URL on success

### 2.6 Implement manual `consolidate` command
> Tech design §9.2. Corresponds to User Story 4.

- [x] Read `decisions.md` for the given feature slug
- [x] If empty, return "nothing to consolidate"
- [x] Read all other feature files (`implementation.md`, `prd.md`, `design.md`, `qa.md`)
- [x] Classify entries by section keyword → target file
- [x] Append consolidated entries to appropriate feature files
- [x] Clear `decisions.md` after merge
- [x] Return summary of what was merged and where
- [x] Registered as MCP tool (not just CLI command)

---

## Phase 3: Transport & Deployment

### 3.1 HTTP/SSE transport (remote)
> Tech design §11, §SSE Keepalive

- [x] HTTP/SSE transport via `SSEServerTransport` with `/sse` and `/messages` endpoints
- [x] SSE keepalive: sends `: ping\n\n` every 25 seconds
- [x] Cleanup on connection close
- [x] CORS headers for cross-origin MCP clients
- [x] Health check endpoint (`/health`)

### 3.2 stdio transport (local)
> Tech design §12

- [x] stdio transport via `StdioServerTransport`
- [x] Transport selection via CLI flag (`--sse` for HTTP, default is stdio)
- [x] MCP handshake verified working

### 3.3 Deploy to Cloudflare Workers
> Tech design §11 Hosting section

- [ ] Create Cloudflare Worker project (`wrangler init` or adapt existing setup)
- [ ] Add `nodejs_compat` flag in `wrangler.toml` for MCP SDK compatibility
- [ ] Set `GITHUB_TOKEN` as a Cloudflare Worker secret (`wrangler secret put GITHUB_TOKEN`)
- [ ] Deploy: `wrangler deploy`
- [ ] Verify the deployed URL is accessible and returns MCP server metadata
- [ ] Test SSE connection stays alive beyond 30 seconds (keepalive working)

### 3.4 Client configuration examples
> Tech design §12

- [x] README documents Claude Code stdio config
- [x] README documents HTTP/SSE remote setup
- [ ] Create example `.mcp.json` for Cursor
- [ ] Document remote URL once deployed

---

## Phase 4: Manual Validation

> Testing checklist — done by you. Tech design §15.

### 4.1 `list_features` tool
- [ ] Returns all 6 seeded features
- [ ] Each feature has correct `slug`, `status`, `owner`
- [ ] Handles a feature with missing/malformed `index.md` gracefully

### 4.2 `get_feature` tool
- [ ] Returns all hot storage files for a feature (index.md, decisions.md, prd.md, etc.)
- [ ] Returns bundled cold storage docs (CLAUDE.md, relevant tech design)
- [ ] Returns clear error for a non-existent slug

### 4.3 `update_feature` tool
- [ ] Appends to `decisions.md` with correct timestamp and agent identifier
- [ ] Creates `decisions.md` if it doesn't exist
- [ ] SHA conflict retry: open two parallel update calls, both succeed (one retries)

### 4.4 Consolidation
- [ ] Seed `decisions.md` with several entries, run consolidate, verify entries merged into feature files
- [ ] Verify `decisions.md` is cleared after consolidation

### 4.5 Transport
- [ ] MCP connects via HTTP/SSE from a web client (Gemini, ChatGPT, or test client)
- [ ] SSE connection stays alive beyond 30 seconds (keepalive working)
- [ ] MCP connects via stdio from Claude Code
- [ ] MCP connects via stdio from Cursor (if available)

### 4.6 End-to-end user stories
- [ ] **Story 1:** Call `list_features()` → get structured list → verify all features present
- [ ] **Story 2:** Call `get_feature("presentation-mode")` → verify full context returned including cold storage docs
- [ ] **Story 3:** Call `update_feature("presentation-mode", "implementation", "Added slide transition animation")` → verify `decisions.md` updated on GitHub
- [ ] **Story 4:** Run `consolidate presentation-mode` → verify decisions merged, `decisions.md` cleared
