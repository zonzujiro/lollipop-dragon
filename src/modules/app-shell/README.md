# app-shell

## Purpose

Owns application-level shell state that is not specific to host review, peer review, sharing, or relay transport.

## Owns

- theme
- toast
- focus mode

## Does not own

- tabs
- file system sessions
- share lifecycle
- relay transport
- peer review drafts or submissions

## State

- `theme`
- `toast`
- `focusMode`

## Public API

- `createAppShellState()`
- `createAppShellActions()`
- shell selectors from `selectors.ts`

## Side Effects

This module is pure and owns only serializable shell state.

## Related Docs

- [Architecture](../../../ARCHITECTURE.md)

## Invariants

- shell state must not depend on host mode vs peer mode

## Common Failure Modes

- mixing shell concerns into feature modules
- letting focus logic leak into the root store
