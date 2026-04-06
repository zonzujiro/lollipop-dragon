# sharing

## Purpose

Owns host-side share lifecycle and unresolved incoming peer review state.

## Owns

- share records
- share keys
- active share selection
- shared panel state
- pending peer comments per shared document
- queued resolve IDs

## Does not own

- relay socket lifecycle
- peer draft comments
- host file tab lifecycle
- peer-mode content loading

## State

Target state to move here:

- `shares`
- `shareKeys`
- `activeDocId`
- `sharedPanelOpen`
- `pendingComments`
- `pendingResolveCommentIds`

## Public API

Planned public API:

- sharing selectors
- pure share-state transitions
- controller commands for share create/revoke/update and pending comment handling

## Side Effects

Expected side effects:

- share upload
- share update
- share revoke
- restore share sessions

## Related Docs

- [Realtime Comment Spec](/home/zonzujiro/projects/lollipop-dragon/docs/features/realtime-comments/spec.md)
- [Realtime Comment Technical Design](/home/zonzujiro/projects/lollipop-dragon/docs/features/realtime-comments/technical-design.md)
- [Module Architecture Refactor](/home/zonzujiro/projects/lollipop-dragon/docs/design/module-architecture-refactor.md)

## Invariants

- unresolved incoming peer comments are keyed by `docId`
- queued resolve IDs must survive reconnect behavior without resurrecting removed comments

## Common Failure Modes

- mixing relay connection logic into share state
- coupling share CRUD directly to peer review draft state
