---
name: feature-plan
description: Create spec.md and todos.md for a new feature. Use when starting work on a new feature or initiative.
argument-hint: <feature-name> <brief description>
allowed-tools: Read, Write, Glob, Grep, Agent
---

# Feature Plan

Create planning documents for a new feature: $ARGUMENTS

## Instructions

1. **Research first.** Read `docs/contributing.md` and `CLAUDE.md` for project conventions. Read existing feature specs in `docs/` to match style and depth. Understand the current architecture before designing.

2. **Talk to the user.** Before writing anything, clarify scope — ask what is included and what is explicitly out of scope. Ask about known constraints.

3. **Create two files in `docs/`:**

### `docs/<feature-name>-spec.md` — Feature Specification

The source of truth for what is being built. Structure:

```
# MarkReview — <Feature Name>

## 1. Overview
One paragraph: what this adds and why.

## 2. Context
Current state, what's missing, why this matters now.

## 3. Scope
### Included
- Bullet list of what this feature covers.
### Excluded
- Bullet list of what is explicitly NOT part of this feature.

## 4. User Decisions
| Decision | Choice |
|----------|--------|
Table of design decisions made with the user.

## 5. Architecture
### 5.1 Data Model
Types, interfaces, state shape.
### 5.2 Lifecycle
How data flows — creation, updates, cleanup.
### 5.3 UI
Wireframes (ASCII), component descriptions.

## 6. Interfaces
External contracts — APIs, events, data shapes, localStorage keys, IndexedDB keys.
Include TypeScript signatures where relevant.

## 7. Acceptance Criteria
Numbered list. Each criterion is testable and specific.
1. When X happens, Y should result.
2. ...

## 8. Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
Things that could go wrong.

## 9. Limitations
Known constraints — technical, browser, API, scope.
```

### `docs/<feature-name>-todos.md` — Task List

A categorized, dependency-aware task list linked back to spec.md. Structure:

```
# Todos — <Feature Name>

> Spec: [<feature-name>-spec.md](./<feature-name>-spec.md)

## Types & Data (spec §5.1)
- [ ] Task description
- [ ] Task description

## Store / State (spec §5.2)
- [ ] Task description
  - Depends on: Types & Data
- [ ] Task description

## Services (spec §6)
- [ ] Task description

## Components / UI (spec §5.3)
- [ ] Task description
  - Depends on: Store / State
- [ ] Task description

## Integration
- [ ] Wire component into parent (e.g., Header, App)
  - Depends on: Components / UI

## Testing (spec §7)
- [ ] Test: acceptance criterion 1
- [ ] Test: acceptance criterion 2
  - Depends on: Store / State, Components / UI
```

Rules for todos:

- Group tasks by category (types, store, services, components, integration, testing).
- Each task references the relevant spec section.
- Dependencies between groups are explicit.
- Tasks are ordered so they can be executed top-to-bottom.
- Each task is small enough to be a single commit.

## Style

- Match the tone and structure of existing docs in `docs/`.
- Use numbered sections in specs, checkboxes in todos.
- Be specific — vague tasks like "implement feature" are not acceptable.
- Include TypeScript type signatures in the spec, not pseudocode.
- ASCII wireframes for UI, not descriptions of wireframes.
