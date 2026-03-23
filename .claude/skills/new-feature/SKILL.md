---
name: new-feature
description: Use this skill when the user asks to add, build, or create a new feature — e.g. "I want to add X", "I need a feature that does Y", "let's build Z", "I have a feature request". Guides from raw idea through user stories, contradiction checking, and an explicit implementation gate before writing any code.
allowed-tools: Read, Write, Glob, Grep, Agent
---

# New Feature Workflow

Follow these phases in order. **Do not skip ahead. Do not write any code until the user explicitly approves the implementation plan in Phase 5.**

---

## Phase 1 — Requirements gathering

Ask questions until you have a clear and complete picture of the feature. Do not ask all questions at once — ask the most important ones first, then follow up based on the answers.

Things to understand:

- What problem does this solve for the user? What is the trigger / pain point?
- Who is the actor (host, peer, both)?
- What are the visible UI interactions?
- What are the edge cases and error states?
- What is explicitly out of scope?
- Are there any constraints (performance, backward compatibility, platform)?

Continue asking until you could write a spec without guessing anything.

---

## Phase 2 — Write user stories

Once you understand the feature, write user stories and present them to the user for confirmation before proceeding.

Format each story as:

```
As a <actor>, I want to <action> so that <outcome>.

Acceptance criteria:
- <specific, testable condition>
- <specific, testable condition>
```

Group stories by actor or flow. Ask the user: "Do these cover what you had in mind? Anything missing or wrong?"

Do not proceed until the user confirms the stories are correct.

---

## Phase 3 — Cross-check with existing docs

Read all docs in `docs/` and cross-check the confirmed user stories against them. Look for:

- Conflicts with existing features or architectural decisions
- Assumptions the new feature makes that existing features contradict
- State or data model collisions
- UI or UX contradictions

If you find any contradictions, **stop and present them to the user**:

> "I found a contradiction between [new story] and [existing doc / feature]. [Explain the conflict.] How do you want to handle this?"

Do not resolve contradictions on your own. Wait for the user's answer before continuing.

If no contradictions are found, state that clearly and move on.

---

## Phase 4 — Ask about implementation planning

Ask the user:

> "User stories confirmed and no contradictions found. Should I start planning the implementation?"

Do not proceed until the user says yes.

---

## Phase 5 — Implementation TLDR

Give a concise implementation plan. Do not write any code. The TLDR should cover:

- Which files and components will change
- What new types, state, or store actions are needed
- The order of changes (dependencies first)
- Any non-obvious tradeoffs or risks

Format it as a short numbered list. Keep it scannable — this is a plan, not a spec.

Then ask:

> "Does this plan look good? Say 'go ahead' and I'll start implementing."

**Do not implement anything until the user explicitly approves.**

---

## Phase 6 — Implementation

Only enter this phase after explicit approval from the user.

Before writing code:

1. Read `docs/contributing.md` and `CLAUDE.md` for project conventions.
2. Follow the implementation order from the Phase 5 plan.
3. Follow all code guidelines (braces on all blocks, no `as` casts, CSS over JS for visuals).

After implementation, ask the user if they want a spec doc written to `docs/` to capture what was built.
