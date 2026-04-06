# Real-Time Comment Sync — Archived Todo List

This document is retained only so older review notes and discussion links still resolve.

It does **not** describe the shipped implementation.

The old todo list was written for an earlier rollout that kept KV comment endpoints alongside the relay. That design was replaced.

Use these current documents instead:

- [spec.md](./spec.md)
- [technical-design.md](./technical-design.md)
- [review-analysis.md](./review-analysis.md)

Current implementation summary:

- unresolved peer comments are stored in `RelayHubSqlite`
- reconnect recovery uses `comments:snapshot`
- `/comments/*` REST endpoints are no longer part of the feature design
- host-authored local comments remain local-only
