# Dragon Desktop Agent Client

## Status

Proposed planning document. No implementation is included in this change.

## Problem

Dragon is currently a browser application. In host mode it depends on browser file
and folder APIs for local markdown review, while agent handoff is manual: Dragon
generates prompts and the user pastes them into an LLM CLI.

The desktop client should keep the website intact while adding native local-file
access and product-level agent actions. The goal is not to turn Dragon into a
terminal project manager. The goal is to let Dragon own review workflows and use
local agents underneath.

## Goals

- Keep the website version available and useful.
- Keep peer mode browser-first and install-free for reviewers.
- Add a desktop host runtime with native file and folder access.
- Replace manual copy-paste agent handoff in desktop host mode with UI actions.
- Keep agent runs scoped to the tab and task that started them.
- Allow an optional visible terminal/session panel for inspection, debugging, and
  manual takeover.
- Support macOS first while keeping Windows support as an architectural
  constraint.

## Non-Goals

- Do not remove browser File System Access support from the website.
- Do not require peers to install the desktop client.
- Do not make local agent execution available in peer mode.
- Do not make `tmux` the only possible agent backend.
- Do not introduce a Kanban or per-task worktree product model as part of this
  feature.
- Do not store mutable process, terminal, socket, or watcher objects in Zustand.

## Runtime Split

Dragon should have one shared product surface and multiple runtime
implementations.

```text
Shared Dragon app
  - markdown renderer
  - CriticMarkup comments
  - host review UI
  - peer review UI
  - sharing flows
  - tabs and workspace state

Runtime implementations
  - Web runtime
      - browser file and folder APIs
      - copy-prompt agent handoff
      - no local agent process
  - Desktop runtime
      - native file and folder APIs
      - native file watching
      - agent runs
      - optional terminal/session panel
```

The shared UI should ask runtime capabilities what is available instead of
importing browser or desktop APIs directly.

## User Stories

### Website Host

As a website user, I want to keep opening and reviewing markdown files in the
browser so that the existing web workflow remains available.

Acceptance criteria:

- Existing browser file and folder opening still works.
- Existing comment, CriticMarkup, rendering, and peer-sharing flows still work.
- The website does not require a desktop app, local daemon, terminal, or agent
  runtime.

As a website user, I want to keep copying generated agent prompts so that I can
manually paste them into my preferred agent CLI.

Acceptance criteria:

- Website keeps the current copy-prompt behavior.
- Website does not show desktop-only run-agent controls as if they work locally.
- If agent automation is unavailable, the UI falls back to prompt-copying.

### Desktop Host

As a desktop user, I want Dragon to open local files and folders through native
desktop filesystem access so that I am not dependent on experimental browser file
APIs.

Acceptance criteria:

- Desktop can open and edit local markdown files and folders.
- Desktop uses native path-based file access.
- Website continues using its browser filesystem implementation.

As a desktop user, I want to click a Dragon UI action to ask an agent to address
comments so that I do not need to manually copy and paste prompts.

Acceptance criteria:

- Dragon can build an agent prompt from the active tab, active file, and selected
  comment state.
- Dragon can start an agent run from a UI action.
- The run is associated with the tab and workspace context that started it.
- The user can see whether the run is active, completed, failed, stopped, or
  needs attention.

As a desktop user, I want an optional visible terminal/session panel so that I can
inspect, debug, or take over an agent run when needed.

Acceptance criteria:

- The desktop runtime can expose the raw session for a run when the backend
  supports it.
- The terminal is not the primary product surface by default.
- Hiding the terminal does not stop the run.
- Closing a tab with an active run requires an explicit user decision.

### Maintainer

As a Dragon maintainer, I want website and desktop to share the same editor and
review UI so that desktop does not become a fork of the product.

Acceptance criteria:

- Shared UI depends on runtime capabilities, not directly on browser or desktop
  APIs.
- Web and desktop provide separate runtime implementations.
- Shared features like markdown rendering, comments, peer mode, and CriticMarkup
  logic stay common.

As a Dragon maintainer, I want agent execution behind a runner boundary so that
Dragon can start with terminal-backed agents without locking the architecture to
one terminal backend.

Acceptance criteria:

- Desktop can start with a terminal-backed runner.
- Future runners can use Codex app-server or another structured protocol.
- Windows support is not blocked by hard-coding `tmux` as the only possible
  backend.

## Tab And Agent Scope

Host mode already treats each tab as an independent workspace. Desktop agent runs
should follow the same boundary.

Rules:

- Agent runs are host-mode only.
- Agent runs are tab-scoped by default.
- A tab may have at most one active run in v1.
- The app may impose a small global active-run limit.
- Switching tabs does not stop a run.
- A run does not automatically receive context from other open tabs.
- Folder-level runs require explicit user intent.

Example:

```text
Tab A: docs/spec.md
  - run: address unresolved comments

Tab B: README.md
  - no run

Tab C: other-project/docs/
  - run: answer threaded questions
```

## Context Rules

Each agent run receives a frozen context package when it starts. The package
should be derived from the action the user selected.

Default active-file action:

- active tab only
- active file only
- unresolved or selected comments in that file
- current raw markdown content
- instruction to edit only that file

Folder action:

- active tab only
- selected folder or workspace only
- bounded list of files containing relevant comments
- explicit confirmation before start

The generated prompt should state the target path, task, included comments, and
out-of-scope files.

## Desktop Agent Actions For V1

Initial actions should be narrow:

- Address unresolved comments in the active file.
- Answer threaded `question:` comments in the active file.
- Review pending peer comments after they have been merged or selected by the
  host.

Broader folder/workspace actions can follow after the run model is proven.

## Website Behavior

The website should remain honest about what it can do:

- Keep copy-prompt actions.
- Do not show local run-agent controls.
- Continue relying on browser file APIs in host mode.
- Continue making peer mode available to any modern browser.

The website may later gain an upgrade path such as "open in desktop", but that is
outside this first desktop planning scope.

## Open Questions

- Which desktop shell should host the first implementation: Tauri, Electrobun, or
  another runtime?
- Which runner should be built first: terminal/tmux runner, Codex app-server
  runner, or both behind one interface?
- What is the exact global concurrency limit for active runs?
- How should desktop handle agent authentication and first-run setup?
- What is the minimum Windows backend for terminal/session support if `tmux` is
  not available?

## References

- Existing LLM handoff workflow:
  `docs/features/criticmarkup-comments.md`
- Existing tab-scoped host model:
  `docs/features/multi-tab.md`
- Existing architecture overview:
  `ARCHITECTURE.md`
- Browser file API constraints:
  `docs/contributing.md`
- dev-3.0 terminal-first reference:
  https://github.com/h0x91b/dev-3.0
- dev-3.0 agent support matrix:
  https://github.com/h0x91b/dev-3.0/blob/main/agent-support-matrix.md
- dev-3.0 PTY server:
  https://github.com/h0x91b/dev-3.0/blob/main/src/bun/pty-server.ts
- dev-3.0 tmux handler:
  https://github.com/h0x91b/dev-3.0/blob/main/src/bun/rpc-handlers/tmux-pty.ts
