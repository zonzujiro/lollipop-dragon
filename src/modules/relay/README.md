# relay

## Purpose

Owns relay runtime state and relay transport orchestration.

## Owns

- relay status
- document update availability
- subscribe and unsubscribe orchestration
- reconnect and resend behavior
- inbound relay frame handling
- generation-scoped subscription state
- ordered snapshot/live-event application
- external payload validation and content-free diagnostics

## Does not own

- share CRUD
- host tab lifecycle
- peer draft comment state
- host markdown review state

## State

- `relayStatus`
- `documentUpdateAvailable`

Per-document host subscription state and the peer submission subscription are
owned by their feature states; relay updates them through the application port.

## Public API

- `createRelayState()`
- `createRelayActions()`
- `configureRelayApplicationPort()`
- relay selectors from `selectors.ts`
- transport orchestration in `controller.ts`

## Side Effects

This module owns the relay transport side effects in `controller.ts`:

- WebSocket lifecycle
- relay subscribe and unsubscribe
- ping and reconnect
- relay message decrypt and dispatch
- stale-generation rejection and per-subscription event queues
- boundary validation, quarantine dispatch, and bounded diagnostics

## Related Docs

- [Realtime Comment Spec](../../../docs/features/realtime-comments/spec.md)
- [Realtime Comment Technical Design](../../../docs/features/realtime-comments/technical-design.md)
- [Architecture](../../../ARCHITECTURE.md)

## Invariants

- the relay module owns transport behavior, not feature-owned domain state
- relay runtime objects must stay outside persisted Zustand state
- relay code must not import the composed store; it reads application commands
  through `RelayApplicationPort`
- a connected socket is not a live document; Live requires a confirmed current
  subscription generation
- snapshot and later live events for one generation commit in receive order

## Common Failure Modes

- letting relay transport mutate feature internals directly
- mixing transport orchestration into the central store
- treating an operation-scoped rejection as a subscription failure
- routing by whichever runtime mode happens to be visible instead of the
  subscription's recorded role
