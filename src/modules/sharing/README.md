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
- stable workspace-to-share ownership
- per-share subscription and quarantine state

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
- `incomingReviewSessions`

## Public API

- `createSharingTabState`
- `createSharingActions`
- sharing selectors
- stable share registry and additive legacy migration in `registry.ts`
- durable resolve outbox in `resolveOutbox.ts`
- `ShareStorage` via module-local `storage.ts`

## Side Effects

- share upload
- share revoke
- share session restore
- local share-record persistence
- pending incoming peer-comment reconcile
- fail-closed merge orchestration against the exact owning tab

## Related Docs

- [Realtime Comment Spec](../../../docs/features/realtime-comments/spec.md)
- [Realtime Comment Technical Design](../../../docs/features/realtime-comments/technical-design.md)
- [Architecture](../../../ARCHITECTURE.md)

## Invariants

- unresolved incoming peer comments are keyed by `docId`
- queued resolve IDs must survive reconnect behavior without resurrecting removed comments
- a resolve must be persisted before its incoming item is hidden
- share ownership is a stable workspace ID, never a display-name or active-tab guess
- merge must revalidate owner, file target, content, and anchor before writing;
  its embedded peer-comment ID is idempotent on retry

## Common Failure Modes

- mixing relay connection logic into share state
- coupling share CRUD directly to peer review draft state
- first-match ownership when workspace names collide
- hiding review work before resolve intent is durable
