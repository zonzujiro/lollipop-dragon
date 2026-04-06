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

Planned public API:

- shell selectors
- pure shell state transitions

## Side Effects

This module should stay mostly pure. If fullscreen orchestration remains necessary, keep it behind a thin controller instead of state actions.

## Related Docs

- [Module Architecture Refactor](/home/zonzujiro/projects/lollipop-dragon/docs/design/module-architecture-refactor.md)

## Invariants

- shell state must not depend on host mode vs peer mode

## Common Failure Modes

- mixing shell concerns into feature modules
- letting presentation or focus logic leak into the root store
