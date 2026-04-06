# app-shell

## Purpose

Owns application-level shell state that is not specific to host review, peer review, sharing, or relay transport.

## Owns

- theme
- toast
- focus mode
- presentation mode

## Does not own

- tabs
- file system sessions
- share lifecycle
- relay transport
- peer review drafts or submissions

## State

Target state to move here:

- `theme`
- `toast`
- `focusMode`
- `presentationMode`

## Public API

- `createAppShellState()`
- `createAppShellActions()`
- shell selectors from `selectors.ts`

## Side Effects

This module is mostly pure. Fullscreen entry is isolated behind
`controller.ts`, so the root store no longer owns that DOM side effect
directly.

## Related Docs

- [Module Architecture Refactor](/home/zonzujiro/projects/lollipop-dragon/docs/design/module-architecture-refactor.md)

## Invariants

- shell state must not depend on host mode vs peer mode

## Common Failure Modes

- mixing shell concerns into feature modules
- letting presentation or focus logic leak into the root store
