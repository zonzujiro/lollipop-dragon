# host-review

## Purpose

Owns host-side markdown review state and review operations over local content.

## Owns

- host comments
- resolved comments
- active host comment state
- host comment panel state
- undo and write state

## Does not own

- share creation and revoke
- relay socket lifecycle
- peer-mode shared content
- peer draft comments

## State

Target state to move here:

- `comments`
- `resolvedComments`
- `activeCommentId`
- `commentPanelOpen`
- `commentFilter`
- undo and write-related host review fields

## Public API

Planned public API:

- host review selectors
- pure host review transitions
- controller commands for merge/write orchestration

## Side Effects

Expected side effects:

- writing merged content to host files
- comment scanning and refresh coordination

## Related Docs

- [Module Architecture Refactor](/home/zonzujiro/projects/lollipop-dragon/docs/design/module-architecture-refactor.md)

## Invariants

- host review state must remain separate from peer review state
- merge logic must preserve current durable share update behavior

## Common Failure Modes

- mixing file writes into pure state transitions
- coupling host review state to relay implementation details
