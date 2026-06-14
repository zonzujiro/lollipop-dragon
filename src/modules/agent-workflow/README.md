# agent-workflow

## Purpose

Owns serializable metadata for host-mode agent review runs.
Also owns the host-mode controller action that turns Dragon UI intent into a
narrow agent run request.

## Owns

- agent run records
- active run per tab mapping
- bounded finished run history per tab
- run lifecycle status metadata
- active-file address-comments and question-thread run request construction
- bounded folder-level address-comments run request construction
- pending peer-comment run request construction for a selected host share

## Does not own

- process handles
- terminal or PTY objects
- sockets
- agent CLI configuration
- peer-mode review state
- broad workspace agent prompting that is not tied to existing comments

## Invariants

- Agent runs are host-mode concepts.
- Runtime-owned objects stay outside Zustand.
- A tab has at most one active run in the current model.
- Finished runs stay as serializable tab history until dismissed or pruned by the
  per-tab history cap.
- The app allows at most three queued, running, or attention-needed runs at a
  time in v1.
- Web runtime support can expose the same metadata while reporting that local
  execution is unavailable.
- Executable actions are scoped to the active tab.
- Folder-level executable actions use a bounded set of scanned comments from the
  active folder tab.
- Pending peer-comment executable actions use a bounded set of comments from the
  selected share on the active host tab.

## Public API

- `createAgentWorkflowActions` creates serializable run metadata actions.
- `createAgentWorkflowControllerActions` creates side-effecting run start
  actions backed by the active `AgentRuntime`.
- `buildAddressCommentsAgentRunRequest` builds the narrow request passed to the
  runtime for addressing active-file unresolved comments.
- `buildFolderAddressCommentsAgentRunRequest` builds the bounded request passed
  to the runtime for addressing unresolved comments across the active folder
  tab.
- `buildQuestionThreadAgentRunRequest` builds the narrow request passed to the
  runtime for answering active-file question threads.
- `buildPendingPeerCommentsAgentRunRequest` builds the bounded request passed to
  the runtime for reviewing pending peer comments from a selected host share.
