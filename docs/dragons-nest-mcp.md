# Dragon's Nest MCP — Technical Design

## 1. Overview

Dragon's Nest is an MCP server that gives any AI agent (Claude, Gemini, ChatGPT, Slack bots) consistent, structured access to MarkReview feature context — regardless of which AI tool is being used. It adapts the [Harmony Brain MCP](https://github.com/user/wix-brain) pattern for the MarkReview project.

---

## 2. User Stories

### Story 1: Agent asks "what features are being worked on?"

An agent (Claude, Gemini, ChatGPT) calls `list_features()`. The MCP reads all feature directories from hot storage, parses each `index.md` front matter, and returns a structured list:

```
Agent: list_features()
→ [
    { slug: "presentation-mode", status: "in-progress", owner: "Alex" },
    { slug: "file-watcher", status: "done", owner: "Alex" },
    { slug: "comment-threads", status: "planned", owner: "unassigned" }
  ]
```

The agent now knows what exists without browsing repos.

### Story 2: Agent needs full context on a feature

An agent is asked to work on the presentation mode feature. It calls `get_feature("presentation-mode")`. The MCP returns all feature files from hot storage **plus** relevant cold storage docs (CLAUDE.md, related tech design), bundled into one response. The agent has everything it needs to reason about the feature.

### Story 3: Agent records a decision

During a coding session, Claude Code discovers an edge case. It calls `update_feature("presentation-mode", "Empty slides appear when document has consecutive --- dividers. Added guard in SlideParser.")`. The MCP appends this to `decisions.md` with a timestamp. Later, any agent calling `get_feature` will see this decision in context.

### Story 4: User consolidates accumulated decisions

After a week of multiple agents logging decisions, the user runs `consolidate presentation-mode`. The MCP merges all `decisions.md` entries into the appropriate feature files (`implementation.md`, `prd.md`, etc.) and optionally pushes updates to cold storage docs.

---

## 3. Problem

MarkReview development involves multiple AI agents across multiple tools. Each agent:

- Has no shared context about MarkReview's architecture, features, or conventions
- Produces output in its own format with no awareness of CriticMarkup, tab/peer state separation, or component patterns
- Cannot enforce consistent schema across writes
- Must be manually briefed on project context every time

There is no client-agnostic way to inject MarkReview project knowledge into agents. A system prompt (CLAUDE.md) works for Claude Code but does not work for Gemini, ChatGPT, or a Slack bot.

---

## 4. Solution

A dedicated MCP server that wraps GitHub API access. Agents never see the repo structure and never need to be told how to format output. They call a tool, they get a result.

```
Any Agent (Claude / Gemini / ChatGPT / Slack bot)
         ↓  calls tool
Dragon's Nest MCP
  ├── fetches feature files from dragons-nest via GitHub API
  ├── fetches stable reference docs from lollipop-dragon via GitHub API
  └── returns clean, structured result
         ↓
Agent receives output — no knowledge of repos or conventions needed
```

---

## 5. Repos

| Repo | Role | Content |
|------|------|---------|
| `lollipop-dragon` | Cold Storage — stable reference docs | Tech designs, feature specs, CLAUDE.md, source code, iteration roadmap |
| `dragons-nest` | Hot Storage — active feature context + skills | Feature tracking files, MCP server source, skills, daily decisions |

### Why two repos

Cold storage is the existing project repo. It is the source of truth for architecture, conventions, and implemented features. Hot storage is a separate repo dedicated to feature tracking and AI coordination. This separation means:

- Feature context changes (daily decisions, status updates) don't pollute the app repo's commit history
- The MCP server can be deployed independently from the app
- Multiple agents can write to hot storage concurrently without touching app code

### Data flow between repos

Cold storage is **writable** by the MCP for one specific operation: consolidation pushes merged decisions from hot storage into cold storage docs (e.g., updating `docs/iteration-roadmap.md` or tech design files with implementation decisions). All other writes go to hot storage only.

---

## 6. Exposed Tools

### v1 Tools (POC)

| Tool | Type | Description |
|------|------|-------------|
| `get_feature(slug)` | Read | Returns all context files for a feature (from hot storage) + relevant cold storage docs |
| `list_features()` | Read | Lists all features with status and owner — parsed from each feature's `index.md` front matter |
| `update_feature(slug, section, content)` | Write | Appends update to `decisions.md` for the feature |

### Future Tools (v2+)

| Tool | Type | Description |
|------|------|-------------|
| `get_summary(slug)` | Read + SDK | Runs `skills/summary.md` via Claude SDK → returns TLDR of feature status |
| `get_blockers(slug)` | Read + SDK | Runs `skills/blockers.md` via Claude SDK → returns list of current blockers |
| `validate_feature(slug)` | Read + SDK | Checks schema compliance, returns missing/invalid fields |
| `get_reference(path)` | Read | Fetches a file from cold storage (lollipop-dragon) |
| `get_architecture()` | Read | Returns CLAUDE.md + key tech design docs from cold storage |

### Tool behaviour notes

**`get_feature`** fetches all files in the feature directory from hot storage (`index.md`, `decisions.md`, `prd.md`, etc.) and bundles them into a single response. It also includes the relevant cold storage docs (CLAUDE.md, related tech designs) so the agent has full context.

**`list_features`** scans the `features/` directory, reads each `index.md`, parses the YAML front matter, and returns a list of `{ slug, status, owner }` objects.

**`update_feature`** always writes to `decisions.md`, never directly to main feature files. This is append-only to avoid SHA conflicts when multiple agents update the same feature concurrently (see section 9.1 for details).

---

## 7. Repository Structure — dragons-nest

```
dragons-nest/
├── server/
│   ├── src/
│   │   ├── index.ts              ← MCP server entry point
│   │   ├── tools/
│   │   │   ├── getFeature.ts
│   │   │   ├── listFeatures.ts
│   │   │   └── updateFeature.ts
│   │   ├── github.ts             ← GitHub REST API client
│   │   └── config.ts             ← repo paths, model config
│   ├── package.json
│   └── tsconfig.json
│
├── skills/
│   └── consolidate.md            ← system prompt for consolidation command
│
├── features/
│   └── {feature-slug}/
│       ├── index.md              ← status, owner, links, created/updated dates
│       ├── prd.md                ← requirements, acceptance criteria
│       ├── design.md             ← component specs, design decisions
│       ├── implementation.md     ← architecture decisions, API contracts, file map
│       ├── decisions.md          ← append-only log, cleared after consolidation
│       └── qa.md                 ← test scenarios, edge cases, results
│
└── README.md
```

---

## 8. Feature File Schema

Each feature directory follows a minimal structure. The `index.md` file uses YAML front matter so `list_features` and `get_feature` can return structured metadata (status, owner) alongside the raw content. This lets agents filter and reason about features without parsing free-form text.

### 8.1 index.md

```markdown
---
status: in-progress | planned | done | blocked
owner: <name>
---

# Presentation Mode

One-paragraph summary of the feature.

## Links
- Tech design: docs/presentation-mode.md
- PR: #42
```

### 8.2 decisions.md

```markdown
## 2026-03-14T10:23:00Z — Claude Code
Added keyboard shortcut (Escape) to exit presentation mode.

## 2026-03-14T14:15:00Z — Gemini
Identified edge case: empty slides when document has consecutive `---` dividers.
```

All other files (`prd.md`, `design.md`, `implementation.md`, `qa.md`) are free-form markdown.

---

## 9. Write Flow — decisions.md

All agent writes go to `decisions.md` only. This is append-only.

```
Agent calls update_feature("presentation-mode", "added Escape key to exit slides")
        ↓
MCP:
  1. GitHub API GET → fetch current decisions.md + its SHA
  2. Append new entry with timestamp and source agent
  3. GitHub API PUT → commit updated decisions.md
        ↓
Returns commit URL
```

### 9.1 SHA Conflict Handling

GitHub's file update API (`PUT /repos/.../contents/...`) requires the current file's SHA hash to prevent silent overwrites. If two agents read `decisions.md` at the same time, they both get SHA `abc123`. Agent A writes first — GitHub accepts and the file's SHA becomes `def456`. When agent B tries to write with the stale SHA `abc123`, GitHub returns a **409 Conflict** error.

The fix is a simple retry loop:

```
1. Catch 409 error
2. Re-fetch decisions.md to get the new SHA (which now includes agent A's append)
3. Re-append agent B's content to the updated file
4. Retry PUT with the fresh SHA
```

This is safe because writes are always appends — no data is lost, entries just end up in a slightly different order.

### 9.2 Consolidation (Manual Command)

Consolidation merges accumulated `decisions.md` entries into the appropriate feature files and optionally pushes updates to cold storage (lollipop-dragon docs). In v1, this is triggered manually — no cron or automation.

```
User runs: consolidate <feature-slug>
        ↓
  1. Read decisions.md from hot storage
  2. Read current implementation.md / prd.md / etc. from hot storage
  3. Merge decisions into the appropriate feature files
  4. Clear decisions.md
  5. Commit to hot storage
  6. (Optional) Push relevant updates to cold storage docs
```

---

## 10. Cold Storage Access

The MCP reads from the lollipop-dragon repo to provide agents with stable reference context:

| What | Path in lollipop-dragon | When used |
|------|------------------------|-----------|
| Project conventions | `CLAUDE.md` | Bundled with `get_feature()` response |
| Tech designs | `docs/*.md` | Bundled with `get_feature()` when relevant |
| Source code | `src/**` | Future `get_reference()` tool (v2) |
| Iteration roadmap | `docs/iteration-roadmap.md` | Bundled with `get_feature()` response |

The MCP also **writes** to cold storage during consolidation — pushing merged decisions back into lollipop-dragon docs (e.g., updating tech designs or the iteration roadmap with implementation decisions).

---

## 11. Technical Stack

| Concern | Decision | Why |
|---------|----------|-----|
| Language | TypeScript / Node.js | Same as MarkReview; shared tooling |
| MCP SDK | `@modelcontextprotocol/sdk` | Official MCP SDK |
| GitHub access | GitHub REST API directly | Server-side token; no client GitHub config needed |
| AI skill execution (v2) | Anthropic Claude SDK (Sonnet) | Sonnet is used for *internal* skill tasks (summarizing, finding blockers) — fast and cheap for structured extraction. The *outer* agent calling the MCP can be any model. Opus would cost ~5x more with marginal benefit for these tasks. Not needed in v1. |
| Transport | HTTP/SSE (remote, for all clients) | Required for web-based clients (Gemini, ChatGPT) that can't run local processes |

### Hosting

The MCP must be hosted remotely so web-based clients (Gemini, ChatGPT) can connect via URL. Requirements: free, single user, easy setup, supports HTTP/SSE (long-lived connections).

| Option | Free Tier | SSE Support | Ease | Notes |
|--------|-----------|-------------|------|-------|
| **Cloudflare Workers** | 100K req/day | Yes (with 25s keepalive pings) | Easy | You already use Cloudflare for MarkReview's worker. Not full Node.js (V8 isolates), but MCP SDK has Workers compatibility. 30s idle timeout on free tier — needs periodic pings. |
| **Fly.io** | 3 shared VMs (256MB) | Yes (native) | Easy | Real Node.js VM — SSE works without workarounds. `fly launch` auto-detects Node. Requires credit card for free tier. |
| **Azure Container Apps** | 180K vCPU-sec/month | Yes (native) | Medium | Best Azure option. Supports long-lived connections. Free tier tight for always-on (~2 hrs/day continuous). Good for intermittent POC usage. |
| **Azure Functions** | 1M exec/month | No — 5-10min timeout kills SSE | N/A | **Not suitable.** Serverless execution timeout breaks SSE connections. |
| **Azure App Service (F1)** | 60 CPU-min/day | No — sleeps after 20min idle | N/A | **Not suitable.** App sleeps, dropping connections. No "Always On" on free tier. |
| **Railway** | No free tier | Yes | Very easy | **Not free** (removed free tier in 2023). $5/month hobby plan. |

**Recommendation:** **Cloudflare Workers** — you already have Cloudflare experience from the peer sharing worker, the free tier is generous, and it's the easiest to deploy. The MCP SDK works on Workers with the `nodejs_compat` flag. If you hit SSE issues with the 30s idle timeout, fall back to **Fly.io**.

For local development and testing, stdio transport also works (Claude Code, Cursor launch the MCP as a local process).

### GitHub Auth — Token Management

The GitHub token is **never saved in the MCP source code**.

**v1 (POC — single user):** Server-side PAT as environment variable.

Since you're the only user for the POC, the simplest approach is a fine-grained [GitHub Personal Access Token](https://github.com/settings/tokens) scoped to the two repos (`lollipop-dragon`, `dragons-nest`). The token is set as an environment variable on the hosting platform (e.g., Cloudflare Worker secret, Fly.io secret) — never in source code.

For local development/testing via stdio, the token lives in the local MCP client config (gitignored):

```json
{
  "mcpServers": {
    "dragons-nest": {
      "command": "node",
      "args": ["./server/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

**v2 (multi-user — GitHub OAuth):**

For multi-user scenarios where each person authenticates as themselves, GitHub OAuth is the way to go. Implementation effort: ~2-4 hours. The flow:

1. MCP client connects to your server URL
2. Server responds with 401 + OAuth metadata (per MCP auth spec)
3. Client redirects user to GitHub OAuth: `https://github.com/login/oauth/authorize?client_id=...&scope=repo`
4. User approves on GitHub
5. GitHub redirects back to your MCP server with an authorization code
6. Server exchanges code for a GitHub access token, stores it in a session
7. All subsequent MCP calls use that user's token for GitHub API requests

This requires registering a GitHub OAuth App (free, takes 2 minutes in GitHub settings). Each user authenticates once, and the MCP acts on their behalf with their own permissions.

**v3 (production — GitHub App):**

A GitHub App is a first-class integration registered on GitHub (like a bot account with its own identity). Here's how it works:

1. **You create a GitHub App** in your GitHub settings (Settings → Developer settings → GitHub Apps → New). You give it a name (e.g., "Dragon's Nest MCP"), select the permissions it needs (e.g., Contents: read/write for repo files), and set a callback URL for OAuth.
2. **Users install the app** on their GitHub account or organization. They visit the app's public page and click "Install". During installation, they choose which repositories the app can access (e.g., only `lollipop-dragon` and `dragons-nest`). This is a one-time step.
3. **When a user connects to the MCP**, the server runs an OAuth flow (similar to v2) but using the GitHub App's credentials. The resulting token is automatically scoped to only the repos where the user installed the app — the MCP cannot access anything else.
4. **Tokens expire after 8 hours.** The MCP server handles renewal transparently:
   - On first connection: the OAuth flow produces an **access token** (8h) and a **refresh token** (6 months). The MCP stores both server-side (in-memory or a simple KV store), keyed to the user's session.
   - On every GitHub API call: the MCP checks the access token's expiry. If expired (or close to it), it calls GitHub's token refresh endpoint (`POST https://github.com/login/oauth/access_token` with `grant_type=refresh_token`) to get a new access token. This is invisible to both the user and the AI agent.
   - The user never sees or manages tokens. They authenticate once via the OAuth redirect, and the MCP keeps the session alive by refreshing automatically.
   - If a user uninstalls the app from their GitHub account, both tokens are immediately revoked and the next MCP call returns an auth error.

The key difference from a plain OAuth App (v2): the GitHub App's tokens are scoped per-installation (only the repos the user chose), not per-user (all repos the user has access to). This is the tightest security model GitHub offers.

More setup (~4-8 hours) but the gold standard for production.

---

## 12. Client Connection

Remote URL for all web-based clients (Gemini, ChatGPT, Claude web):

```
https://dragons-nest.<your-domain>.workers.dev/mcp
```

For local clients (Claude Code, Cursor), stdio transport:

```json
{
  "mcpServers": {
    "dragons-nest": {
      "command": "node",
      "args": ["/path/to/dragons-nest/server/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

---

## 13. Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Any AI Agent                            │
│         (Claude / Gemini / ChatGPT / Slack bot)           │
└───────────────────────┬──────────────────────────────────┘
                        │ MCP tool call (HTTP/SSE or stdio)
                        ▼
┌──────────────────────────────────────────────────────────┐
│              Dragon's Nest MCP Server                      │
│          (Cloudflare Workers / Fly.io)                     │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │ get_feature   │  │ list_features │  │ update_feature │   │
│  │ (read both    │  │ (read hot     │  │ (write hot     │   │
│  │  repos)       │  │  storage)     │  │  only)         │   │
│  └──────┬────────┘  └──────┬────────┘  └──────┬─────────┘   │
│         │                  │                   │              │
│         └──────────┬───────┘───────────────────┘              │
│                    │                                           │
│             ┌──────▼──────┐                                   │
│             │ GitHub REST  │                                  │
│             │ API Client   │                                  │
│             └──────┬───────┘                                  │
└────────────────────┼──────────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
┌────────────────┐    ┌───────────────┐
│  dragons-nest   │    │lollipop-dragon│
│  (Hot Storage)  │    │(Cold Storage) │
│                 │    │               │
│  features/      │    │  CLAUDE.md    │
│  skills/        │    │  docs/        │
│  server/        │    │  src/         │
│                 │    │               │
│  read + write   │    │  read (+write │
│                 │    │  on consolidn)│
└────────────────┘    └───────────────┘
```

---

## 14. Roadmap

### v1 — POC (current)

| Feature | Why |
|---------|-----|
| `get_feature(slug)` tool | Core read path — agents need full context on a feature to do useful work |
| `list_features()` tool | Agents need to discover what features exist before they can ask about one |
| `update_feature(slug, section, content)` tool | Core write path — agents record decisions so other agents can see them |
| GitHub REST API client (both repos) | The transport layer for all reads/writes; abstracts away repo structure from agents |
| HTTP/SSE transport (remote) | Web-based clients (Gemini, ChatGPT) connect via URL; they can't run local processes |
| stdio transport (local) | Claude Code and Cursor launch the MCP locally for faster dev/testing |
| Feature file schema (`index.md` front matter) | Minimal structured metadata (`status`, `owner`) so `list_features` can return parseable data |
| Manual consolidation command | Merges accumulated `decisions.md` into feature files; keeps feature docs current without automation overhead |
| Server-side PAT for GitHub auth | Simplest auth for single-user POC; token as env var on hosting platform |
| Cloudflare Workers deployment | Free hosting with SSE support; you already have Cloudflare experience |

### v2 — Multi-user & SDK Skills

| Feature | Why |
|---------|-----|
| GitHub OAuth (per-user auth) | Each user authenticates as themselves; no shared token |
| `get_summary(slug)` — Claude SDK skill | Quick TLDR of feature status without reading all files |
| `get_blockers(slug)` — Claude SDK skill | Surface blockers automatically from feature context |
| `validate_feature(slug)` — Claude SDK skill | Catch missing/invalid fields in feature files |
| `get_reference(path)` tool | Direct access to any cold storage file (source code, docs) |
| `get_architecture()` tool | Returns CLAUDE.md + all tech designs in one call |
| Automated consolidation (cron) | Daily GitHub Actions job merges decisions without manual trigger |

### v3 — Production

| Feature | Why |
|---------|-----|
| GitHub App auth | Fine-grained permissions, token expiry, per-repo scoping |
| Semantic search across features | Find related decisions across all features |
| Real-time notifications | Push updates when features change instead of polling |

---

## 15. Implementation Order

### Phase 1: Repository Setup

1. Create `dragons-nest` repo
2. Seed feature directories from actual lollipop-dragon features:
   - `features/criticmarkup-comments/` — status: **done** (v1, shipped)
   - `features/peer-sharing/` — status: **done** (v2, shipped)
   - `features/multi-tab/` — status: **done** (v4, shipped)
   - `features/presentation-mode/` — status: **in-progress**
   - `features/realtime-collaboration/` — status: **planned** (v3, designed but not started)
   - `features/dragons-nest-mcp/` — status: **in-progress** (this project itself)
3. Write `skills/consolidate.md` (system prompt for consolidation)
4. Document repo structure in `README.md`

### Phase 2: MCP Server Core

5. Scaffold TypeScript MCP server with `@modelcontextprotocol/sdk`
6. Implement GitHub REST API client (read file, write file, list directory) for both repos
7. Implement `list_features()` — scan feature directories, parse `index.md` front matter
8. Implement `get_feature(slug)` — fetch all files in a feature directory + relevant cold storage docs
9. Implement `update_feature(slug, section, content)` — append to decisions.md with SHA conflict retry
10. Implement manual `consolidate` command

### Phase 3: Transport & Deployment

11. Add HTTP/SSE transport for remote clients
12. Add stdio transport for local clients
13. Deploy to Cloudflare Workers (or Fly.io)
14. Set `GITHUB_TOKEN` as a platform secret (never in code)
15. Create example MCP client configs (Claude Code, Cursor, web clients)

### Phase 4: Manual Validation

Testing checklist (done by you):

16. `list_features` returns all features with correct status/owner
17. `get_feature` returns correct files from both repos
18. `update_feature` appends to decisions.md correctly
19. Concurrent writes to `decisions.md` resolve via SHA retry
20. Consolidation merges decisions into feature files
21. MCP connects via HTTP/SSE from a web client
22. MCP connects via stdio from Claude Code

---

## 16. Known Limitations & Tradeoffs

| Limitation | Acceptable Because |
|---|---|
| Shared PAT, no per-user auth in v1 | Single user POC; GitHub OAuth is v2 |
| Cold storage writable during consolidation | Needed to push merged decisions back to lollipop-dragon docs; writes are controlled and intentional |
| No SDK skills in v1 (summary, blockers, validate) | POC focuses on core read/write flow; SDK tools add cost and complexity |
| Manual consolidation only | Sufficient for POC; automated cron is v2 |
| Feature schema is convention, not enforced at write time | `validate_feature` (v2) will catch violations; enforcement adds complexity |
| Cloudflare Workers 30s idle timeout for SSE | Solved with periodic keepalive pings (~25s); falls back to Fly.io if problematic |
| No notification when a feature is updated | Agents poll via `get_feature`; push notifications are v3 |
