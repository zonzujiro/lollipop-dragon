# agent-workflow

## Purpose

Owns serializable metadata for host-mode agent review runs.

## Owns

- agent run records
- active run per tab mapping
- run lifecycle status metadata

## Does not own

- process handles
- terminal or PTY objects
- sockets
- agent CLI configuration
- peer-mode review state

## Invariants

- Agent runs are host-mode concepts.
- Runtime-owned objects stay outside Zustand.
- A tab has at most one active run in the current model.
- Web runtime support can expose the same metadata while reporting that local
  execution is unavailable.
