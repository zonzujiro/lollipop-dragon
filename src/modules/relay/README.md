# relay

## Purpose

Owns relay runtime state and relay transport orchestration.

## Owns

- relay status
- document update availability
- subscribe and unsubscribe orchestration
- reconnect and resend behavior
- inbound relay frame handling

## Does not own

- share CRUD
- host tab lifecycle
- peer draft comment state
- host markdown review state

## State

Target state to move here:

- `relayStatus`
- `documentUpdateAvailable`

## Public API

- `createRelayState()`
- `createRelayActions()`
- relay selectors from `selectors.ts`
- transport orchestration in `controller.ts`

## Side Effects

This module owns the relay transport side effects in `controller.ts`:

- WebSocket lifecycle
- relay subscribe and unsubscribe
- ping and reconnect
- relay message decrypt and dispatch

## Related Docs

- [Realtime Comment Spec](/home/zonzujiro/projects/lollipop-dragon/docs/features/realtime-comments/spec.md)
- [Realtime Comment Technical Design](/home/zonzujiro/projects/lollipop-dragon/docs/features/realtime-comments/technical-design.md)
- [Module Architecture Refactor](/home/zonzujiro/projects/lollipop-dragon/docs/design/module-architecture-refactor.md)

## Invariants

- the relay module owns transport behavior, not feature-owned domain state
- relay runtime objects must stay outside persisted Zustand state

## Common Failure Modes

- letting relay transport mutate feature internals directly
- mixing transport orchestration into the central store
