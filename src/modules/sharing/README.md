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

- `shares`
- `shareKeys`
- `activeDocId`
- `sharedPanelOpen`
- `pendingComments`
- `pendingResolveCommentIds`

## Public API

- `createSharingTabState`
- `createSharingActions`
- sharing selectors
- share persistence helpers (`saveShares`, `loadAndCleanShares`, `restoreShareKeys`)
- `ShareStorage` via module-local `storage.ts`

## Side Effects

- share upload
- share revoke
- share session restore
- local share-record persistence
- pending incoming peer-comment reconcile

## Related Docs

- [Realtime Comment Spec](../../../docs/features/realtime-comments/spec.md)
- [Realtime Comment Technical Design](../../../docs/features/realtime-comments/technical-design.md)
- [Architecture](../../../ARCHITECTURE.md)

## Invariants

- unresolved incoming peer comments are keyed by `docId`
- queued resolve IDs must survive reconnect behavior without resurrecting removed comments

## Common Failure Modes

- mixing relay connection logic into share state
- coupling share CRUD directly to peer review draft state
