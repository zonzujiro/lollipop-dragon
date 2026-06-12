# Desktop Runtime And Agent Architecture

## Status

Proposed planning document. No implementation is included in this change.

## Summary

The desktop client should add native host capabilities without forking Dragon's
product UI. The shared app should talk to runtime capabilities. Runtime
implementations should provide browser-backed behavior for the website and
native-backed behavior for desktop.

Agent execution should sit behind an `AgentRunner` boundary. A terminal-backed
runner can be the first pragmatic backend, but it should not become the product
architecture. Dragon owns review actions; runners execute them.

## Architecture Shape

```text
UI components
  -> store selectors and actions
  -> feature modules
  -> runtime capability interfaces
      -> web runtime
      -> desktop runtime
          -> filesystem adapter
          -> watcher adapter
          -> agent runner
          -> optional terminal session adapter
```

The feature modules should keep owning product behavior:

- `workspace` owns host file/session lifecycle.
- `host-review` owns host comments and review state.
- `sharing` owns host sharing and incoming peer comment flows.
- `peer-review` owns browser peer mode.
- A future `agent-workflow` module should own review-run state and actions.

## Capability Interfaces

The exact TypeScript shape should be designed during implementation, but the
boundary should separate product concepts from runtime mechanics.

Illustrative capability groups:

```typescript
interface DragonRuntime {
  workspace: WorkspaceRuntime;
  watcher: WatcherRuntime;
  agent: AgentRuntime;
  terminal: TerminalRuntime;
}

interface WorkspaceRuntime {
  openFile(): Promise<OpenedFile>;
  openDirectory(): Promise<OpenedDirectory>;
  readFile(target: FileTarget): Promise<string>;
  writeFile(target: FileTarget, content: string): Promise<void>;
  buildFileTree(target: DirectoryTarget): Promise<FileTreeNode[]>;
}

interface AgentRuntime {
  canRunAgent: boolean;
  startRun(request: AgentRunRequest): Promise<AgentRunId>;
  stopRun(runId: AgentRunId): Promise<void>;
}

interface TerminalRuntime {
  canShowTerminal: boolean;
  attach(runId: AgentRunId): Promise<TerminalAttachment>;
}
```

The web runtime can implement `canRunAgent: false` and keep prompt-copy behavior.
The desktop runtime can implement `canRunAgent: true` when a runner is available.

## Runtime Targets

### Web Runtime

Responsibilities:

- Preserve current browser file and folder workflows.
- Keep prompt-copy handoff.
- Keep peer mode install-free.
- Keep browser persistence and restore semantics.

Constraints:

- Host mode still depends on browser file APIs.
- Local agent execution is unavailable.
- Terminal/session display is unavailable.

### Desktop Runtime

Responsibilities:

- Open local files and folders through native dialogs.
- Read and write files through native path-based APIs.
- Watch files and folders through native watcher APIs.
- Start, stop, and observe agent runs.
- Optionally expose a visible terminal/session panel.

Constraints:

- Mutable native objects, process handles, PTY objects, sockets, and watchers stay
  outside Zustand.
- Store state records serializable run metadata only.
- Agent actions are host-mode only.

## Agent Workflow Model

Dragon should model agent automation as review runs, not as raw terminal tabs.

```text
AgentRun
  - id
  - tabId
  - status
  - taskKind
  - target paths
  - selected comment ids
  - createdAt
  - completedAt
  - runner kind
  - optional terminal attachment id
```

Runtime-owned process/session objects remain outside the persisted store.

Suggested statuses:

- `queued`
- `running`
- `needs_attention`
- `completed`
- `failed`
- `stopped`

## Runner Backends

### Terminal Runner

A terminal runner starts a CLI agent inside a local process/session. It may use
`tmux`, a PTY library, or another backend.

Benefits:

- Fast path for existing CLI agents.
- Good observability.
- Manual takeover is possible.
- Supports agents that do not expose structured APIs.

Risks:

- CLI output is not a stable protocol.
- Auth, approvals, and prompts vary per agent.
- `tmux` is not a portable Windows contract.
- Product state must not depend solely on terminal text scraping.

### Codex App Server Runner

A Codex app-server runner would use Codex's structured rich-client protocol
instead of treating the terminal as the control surface.

Benefits:

- Better structured events.
- Better fit for UI-driven actions.
- Less dependence on terminal parsing.
- More direct control over threads, turns, and lifecycle.

Risks:

- Codex-specific.
- Still requires a separate runner for other agents.
- Requires app-server protocol integration work.

## Hybrid UI Rule

Dragon should be workflow-first, with optional terminal visibility.

```text
User clicks Dragon action
  -> Dragon creates AgentRun
  -> Runner starts work
  -> UI shows run status
  -> Optional terminal panel can inspect or take over
```

This avoids both extremes:

- Not terminal-first: Dragon does not become a terminal manager.
- Not fully hidden: users and developers can recover when CLI agents need
  attention.

## File Context And Permissions

Each run receives an explicit context package at creation time. The default
context should be narrow:

- one tab
- one active file
- selected or unresolved comments
- explicit target path
- explicit instruction not to edit unrelated files

When the runner supports filesystem restrictions, Dragon should set the working
directory and permissions to match the run context. When the runner cannot
enforce the boundary, the generated prompt and UI must still make the scope
clear.

## Multiple Tabs

The current host architecture already treats tabs as isolated workspaces. Desktop
agent runs should preserve that model.

Rules:

- One active agent run per tab in v1.
- No automatic run is started when a tab opens.
- A run is bound to the tab that started it.
- Switching tabs does not stop the run.
- Closing a tab with an active run prompts the user to stop, detach, or cancel
  the close.
- A small app-wide active-run limit should prevent accidental over-parallelism.

## Website Preservation

The desktop work should not remove or degrade the website:

- The web runtime keeps browser file APIs.
- The web runtime keeps copy-prompt handoff.
- Peer mode remains browser-accessible.
- Shared UI uses capability checks for desktop-only controls.
- Desktop-specific setup, runner, and terminal code should not be imported by
  the website bundle.

## Migration Strategy

Suggested implementation phases:

1. Extract runtime capability boundaries around current file and folder access.
2. Implement the web runtime with current browser behavior.
3. Add serializable `AgentRun` metadata and UI capability checks without starting
   processes.
4. Add desktop runtime shell and native filesystem adapter.
5. Add a first desktop runner behind `AgentRuntime`.
6. Add optional terminal attachment for supported runners.
7. Add broader folder/workspace agent actions after active-file runs are proven.

Each phase should keep the website runnable.

Initial implementation note: the first foundation slice introduces
`src/runtime/` and routes host file and folder operations through a web workspace
runtime that delegates to the existing browser filesystem implementation. This
does not add desktop execution yet; it creates the boundary the desktop runtime
can implement later.

Agent workflow implementation note: `src/modules/agent-workflow/` now owns
serializable run metadata and a controller action for active-file threaded
questions. The action builds an `AgentRunRequest` with one tab, one target path,
and explicit question thread ids. The web runtime still reports
`canRunAgent: false`, so the website keeps the copy-prompt path until a desktop
runtime provides an executable `AgentRuntime`.

Second implementation note: the next foundation slice adds serializable
`agent-workflow` run metadata plus web runtime agent and terminal capabilities
that explicitly report local execution as unavailable. This keeps website
behavior unchanged while giving desktop runtime work a stable state and
capability boundary.

UI capability note: the comment-panel threaded-question action resolves through
an agent action capability helper. In the web runtime it remains the existing
"Copy agent prompt" action. When a desktop runtime reports local agent
execution, the same surface becomes "Ask agent" and calls the
question-thread run controller action.

Desktop shell implementation note: `src-tauri/` now contains the first Tauri v2
native shell. It loads the existing Vite app in a native window and adds
`desktop:dev` / `desktop:build` scripts. This does not yet replace browser file
APIs or add native agent execution; it creates the desktop container those
runtime adapters will plug into.

## Risks

- Runtime abstraction may be too broad if introduced before the first desktop
  spike proves real APIs.
- Terminal-backed runners can become fragile if Dragon depends on terminal text
  instead of run lifecycle events.
- Windows support can be blocked if `tmux` becomes a required contract.
- Persisted browser handle compatibility must be preserved for existing website
  users.
- File watchers differ between browser, desktop macOS, and desktop Windows.

## Methodology

This design starts from the existing Dragon architecture: host mode is tab-scoped
and peer mode is root-scoped. The desktop proposal preserves that boundary. The
agent model is intentionally attached to host tabs because open files and
comments are already scoped there.

The dev-3.0 review informed the terminal/session side of the design. It validates
visible durable sessions for CLI agents, but Dragon's product surface remains
markdown review and CriticMarkup workflows rather than task boards or worktree
management.

## References

- Existing architecture:
  `ARCHITECTURE.md`
- Existing host tab model:
  `docs/features/multi-tab.md`
- Existing browser file service design:
  `docs/design/v1-technical-design.md`
- Existing peer sharing design:
  `docs/design/v2-technical-design.md`
- dev-3.0:
  https://github.com/h0x91b/dev-3.0
- dev-3.0 agent support matrix:
  https://github.com/h0x91b/dev-3.0/blob/main/agent-support-matrix.md
- dev-3.0 PTY server:
  https://github.com/h0x91b/dev-3.0/blob/main/src/bun/pty-server.ts
- dev-3.0 tmux handler:
  https://github.com/h0x91b/dev-3.0/blob/main/src/bun/rpc-handlers/tmux-pty.ts
- dev-3.0 tmux startup decision:
  https://github.com/h0x91b/dev-3.0/blob/main/decisions/003-setup-script-tmux-startup.md
