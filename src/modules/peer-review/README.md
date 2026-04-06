# peer-review

## Purpose

Owns peer-mode shared content state and peer-authored comment draft/submission state.

## Owns

- peer shared content
- peer active file selection
- peer name
- peer draft comments
- submitted peer comment IDs
- peer comment panel state

## Does not own

- host tabs
- share CRUD for host mode
- relay socket lifecycle
- host-side pending peer comment state

## State

Target state to move here:

- `sharedContent`
- `peerShareKeys`
- `peerActiveDocId`
- `peerRawContent`
- `peerFileName`
- `peerActiveFilePath`
- `peerComments`
- `peerResolvedComments`
- `peerCommentPanelOpen`
- `myPeerComments`
- `submittedPeerCommentIds`
- `peerName`

## Public API

Planned public API:

- peer selectors
- pure peer draft and selection transitions
- controller commands for shared-content load and peer comment submission

## Side Effects

Expected side effects:

- loading shared content from the Worker
- syncing submitted peer comments through the relay

## Related Docs

- [Realtime Comment Spec](/home/zonzujiro/projects/lollipop-dragon/docs/features/realtime-comments/spec.md)
- [Realtime Comment Technical Design](/home/zonzujiro/projects/lollipop-dragon/docs/features/realtime-comments/technical-design.md)
- [Module Architecture Refactor](/home/zonzujiro/projects/lollipop-dragon/docs/design/module-architecture-refactor.md)

## Invariants

- peer mode must not read host tab state as its source of truth
- peer drafts and submitted IDs must remain consistent across reconnect

## Common Failure Modes

- mixing peer state with host tab state
- coupling relay resend behavior directly into pure state transitions
