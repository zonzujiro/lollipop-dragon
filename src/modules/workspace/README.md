# workspace

## Purpose

Owns host-side tab lifecycle and file-session state.

## Owns

- tabs
- active tab
- file handles
- directory handles
- file tree
- active file path
- restore and refresh orchestration

## Does not own

- peer-mode shared content
- share pending comments
- relay transport
- peer draft comments

## State

Target state to move here:

- `tabs`
- `activeTabId`
- tab-level file session fields

## Public API

Planned public API:

- workspace selectors
- tab lifecycle state transitions
- workspace controller commands for file and directory orchestration

## Side Effects

Expected side effects:

- file open
- directory open
- file refresh
- restore from persisted handles

## Related Docs

- [Module Architecture Refactor](/home/zonzujiro/projects/lollipop-dragon/docs/design/module-architecture-refactor.md)
- [Contributing Guide](/home/zonzujiro/projects/lollipop-dragon/docs/contributing.md)

## Invariants

- workspace state is host-mode state
- file-session orchestration must not leak peer-mode state into tabs

## Common Failure Modes

- coupling tab lifecycle to sharing or relay behavior
- mixing restore/orchestration logic into pure state transitions
