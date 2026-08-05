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

- `comments`
- `resolvedComments`
- `activeCommentId`
- `commentPanelOpen`
- `commentFilter`
- `allFileComments`
- `pendingScrollTarget`
- undo and write-related host review fields

## Public API

- `createHostReviewActions()`
- `createHostReviewControllerActions()`
- host review selectors
- comment scan and resolved-comment refresh helpers

## Side Effects

Current side effects:

- writing merged content to host files
- comment scanning and refresh coordination
- owner-tab-specific writes used by incoming peer-comment merge

## Related Docs

- [Architecture](../../../ARCHITECTURE.md)

## Invariants

- host review state must remain separate from peer review state
- merge logic must preserve current durable share update behavior
- a delayed incoming merge must write only the captured owner tab and file
  target; active-tab changes cannot retarget it

## Common Failure Modes

- mixing file writes into pure state transitions
- coupling host review state to relay implementation details
