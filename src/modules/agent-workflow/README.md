# agent-workflow

## Purpose

Owns serializable metadata for host-mode agent review runs.
Also owns the host-mode controller action that turns Dragon UI intent into a
narrow agent run request.

## Owns

- agent run records
- active run per tab mapping
- run lifecycle status metadata
- active-file question-thread run request construction

## Does not own

- process handles
- terminal or PTY objects
- sockets
- agent CLI configuration
- peer-mode review state
- broad folder/workspace agent prompting

## Invariants

- Agent runs are host-mode concepts.
- Runtime-owned objects stay outside Zustand.
- A tab has at most one active run in the current model.
- Web runtime support can expose the same metadata while reporting that local
  execution is unavailable.
- The first executable action is scoped to the active tab's active file and
  threaded `question:` comments only.

## Public API

- `createAgentWorkflowActions` creates serializable run metadata actions.
- `createAgentWorkflowControllerActions` creates side-effecting run start
  actions backed by the active `AgentRuntime`.
- `buildQuestionThreadAgentRunRequest` builds the narrow request passed to the
  runtime for answering active-file question threads.
