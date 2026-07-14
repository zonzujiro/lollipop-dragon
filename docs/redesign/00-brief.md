# 00 — Brief

## Mission

Rebuild Lollipop Dragon's UI from the ground up to the "Reading Room" design: an editorial, book-quality reading surface for AI-written markdown, with a developer-grade annotation layer of **typed comments** that anchor to **exact character ranges** (not blocks, not lines) and may **overlap freely**.

This is a redesign of the presentation and interaction layer plus one behavioral upgrade (range anchoring). The product's existing capabilities — host/peer modes, CriticMarkup round-trip with agents, encrypted sharing, realtime comment relay, multi-tab, presentation mode, desktop agent runs — all remain, re-skinned and in places re-arranged as specified in `02-screens.md`.

## What is new behavior (not just visuals)

1. **Character-range comment anchoring** — a comment targets `{start, end}` character offsets inside a block's plain text. Users create one by selecting any span of text (a word, half a sentence). Block-level comments (no range) remain possible via the block's `+` affordance or the `C` key.
2. **Overlapping comments are first-class** — two or more comments may cover intersecting ranges. Rendering, selection, resolution, and file serialization must all handle this. See `03-commenting-spec.md`.
3. **Orphan grace** — when the text under an anchor changes (typically after an agent run), the comment keeps its quote, drops its highlight, and shows an "anchor released" note. It must never mis-highlight other text or silently disappear.
4. **Header-integrated workspace tabs** (replaces the separate TabBar strip below the header).
5. **Command palette (⌘K)** and a **J/K keyboard triage model** for comments.

## Ground truth and precedence

When sources conflict, precedence is:

1. `03-commenting-spec.md` (for anchoring/serialization semantics)
2. `reference-prototype/` runtime behavior
3. The other numbered docs
4. Existing product feature docs in `docs/features/` (still authoritative for _capabilities_ — e.g. share TTLs, relay semantics, agent-run limits — but not for visual layout)

Known deliberate gaps in the prototype (do NOT copy these): it does not parse real markdown (blocks are hard-coded), does not persist anything, does not implement real sharing/crypto/relay, fakes the agent run, and its file tree is not collapsible. The real implementation uses the existing services and modules for all of that.

## Constraints (non-negotiable)

- Follow the repo's `CLAUDE.md` in full. Highlights: no `as` type assertions; no `switch`; braces always; ≤4 params (else named object); no single-letter variables; every store action calls `set()`; side-effect-only functions live in `src/services/` or `src/modules/`, not the store; **CSS over JS for visuals**; never mix tab-scoped (host) and root peer state — guard on `peerMode`.
- Host mode is Chrome/Edge (File System Access API); peer mode is any modern browser. Feature-detect, never user-agent sniff.
- Files on disk remain **valid CriticMarkup** at all times — any external CriticMarkup tool must still render them meaningfully.
- WCAG 2.1 AA: 4.5:1 body text, 3:1 UI components and highlight underlines, in both themes.
- Full `prefers-reduced-motion` support: replace movement with crossfade/instant; keep state-communicating feedback.
- Keep the existing test stack and patterns: Vitest + RTL, `setTestState`/`resetTestStore` from `src/testing/testHelpers.ts`, top-level `vi.mock()`.

## Definition of done (whole redesign)

- All acceptance criteria in `05-implementation-plan.md` pass.
- First typed comment achievable in < 10 s from file open (manual stopwatch check of the flow: open → select → type → ⌘↵).
- A 10k-line markdown file renders in < 1 s; comment-layer re-render after adding a comment < 100 ms.
- Zero regressions in the existing Vitest suite; new suites added per phase.
- Both themes pass an automated contrast audit for text and comment-taxonomy colors.
