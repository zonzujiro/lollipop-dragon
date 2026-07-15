# workspace

## Purpose

Owns host-side tab lifecycle and file-session state.

## Owns

- tabs
- active tab
- recent history and restore affordances
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

- `tabs`
- `activeTabId`
- `history`
- `historyDropdownOpen`
- tab-level file session fields

## Public API

- `createWorkspaceState()` and `createWorkspaceActions()`
- `createWorkspaceControllerActions()`
- `getActiveTab()` and tab update helpers
- history persistence and restore helpers

## Side Effects

Current side effects:

- file open
- directory open
- file refresh
- restore from persisted handles

File and folder operations should go through the runtime workspace capability
boundary rather than importing browser filesystem services directly.

## Related Docs

- [Architecture](../../../ARCHITECTURE.md)
- [Contributing Guide](../../../docs/contributing.md)

## Invariants

- workspace state is host-mode state
- file-session orchestration must not leak peer-mode state into tabs

## Common Failure Modes

- coupling tab lifecycle to sharing or relay behavior
- mixing restore/orchestration logic into pure state transitions
