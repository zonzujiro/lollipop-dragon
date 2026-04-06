---
name: bugfix
description: Use this skill when fixing a bug. Guides through investigation, root cause analysis, fix implementation, testing, and mandatory user story/doc updates.
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, Bash
---

# Bugfix Workflow

Follow these phases in order.

---

## Phase 1 — Reproduce & understand

1. Identify the error or unexpected behavior from the user's report.
2. Search the codebase for the relevant code paths (error messages, function names, log lines).
3. Read the code to understand the full flow that leads to the bug.
4. Cross-check with docs in `docs/features/` and `docs/design/` to understand the intended behavior and user stories.

Present a root cause analysis to the user before proceeding.

---

## Phase 2 — Propose the fix

Describe the fix concisely:

- What will change and why
- Which files are affected
- Any edge cases the fix must handle

Ask: "Does this approach look right?" Do not implement until the user confirms.

---

## Phase 3 — Implement the fix

1. Read `docs/contributing.md` and `CLAUDE.md` for project conventions.
2. Implement the fix following all code guidelines.
3. Add or update tests covering the bug scenario.
4. Run the full test suite to confirm nothing is broken.

---

## Phase 4 — Update user stories and docs

**This step is mandatory.** After every bugfix:

1. Identify which user story or spec doc in `docs/features/` covers the area that was broken.
2. Update the doc to reflect the fix — add acceptance criteria, verification steps, or edge case documentation that was missing.
3. If the bug revealed a gap in the spec (e.g., an unhandled error state), document the new behavior so it is covered going forward.

If no existing doc covers the area, mention this to the user and ask if they want a new doc or an addition to an existing one.

---

## Phase 5 — Summary

Present a summary:

- Root cause (one sentence)
- What was fixed
- What tests were added
- What docs were updated
