# peer-review

## Purpose

Owns peer-mode shared content state and peer-authored draft/submission logic.

## Owns

- peer-mode entry state (`isPeerMode`)
- loaded shared content payload
- active peer file selection
- peer name
- peer draft comments
- submitted peer comment IDs
- peer comment panel state

## Does not own

- host tabs and host review state
- host share CRUD
- relay connection lifecycle state
- host-side pending peer comment state

## State

- `isPeerMode`
- `peerName`
- `sharedContent`
- `myPeerComments`
- `submittedPeerCommentIds`
- `peerShareKeys`
- `peerActiveDocId`
- `peerRawContent`
- `peerFileName`
- `peerActiveFilePath`
- `peerResolvedComments`
- `peerComments`
- `peerCommentPanelOpen`

## Public API

- `createPeerReviewState`
- `createPeerReviewActions`
- peer selectors such as `selectUnsubmittedPeerComments`
- controller helpers for shared-content load and peer comment sync

## Side Effects

- loading shared content from the Worker
- starting relay subscription for the shared doc
- syncing submitted peer comments through the relay

## Related Docs

- [Realtime Comment Spec](../../../docs/features/realtime-comments/spec.md)
- [Realtime Comment Technical Design](../../../docs/features/realtime-comments/technical-design.md)
- [Architecture](../../../ARCHITECTURE.md)

## Invariants

- peer mode must not read host tab state as its source of truth
- submitted IDs are ack-driven and must stay separate from local drafts
- changing `peerName` renames unsent peer comments but preserves the author on
  comments whose IDs have already been acknowledged as submitted
- `peerName` is global peer state persisted through the root Zustand store, so
  it applies across shared links in the same browser

## Common Failure Modes

- mixing peer root state with host tab state
- coupling relay resend behavior into selectors or pure state transitions
