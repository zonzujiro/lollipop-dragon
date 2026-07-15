# 05 — Implementation Plan

**Status (14.07.2026): complete.** Phases 1–4 are implemented. Automated unit,
component, typecheck, and production-build validation are the merge gate;
cross-browser and native desktop interaction remain release-environment manual
checks.

Four phases, each independently shippable and demo-able. Work in this repo; follow `CLAUDE.md` and `docs/contributing.md`. Do not fork the UI per runtime — capability facades per `docs/features/desktop-agent-client.md`.

## Phase 1 — Tokens & the reading experience

**Scope**

- Replace `src/ui/styles/tokens.css` values with the Reading Room tokens (`assets/tokens.css`); keep the existing variable-name conventions and `.dark` override mechanism; migrate names where they differ rather than duplicating.
- Re-skin the app shell: `Header` (merge `TabBar` into it — tab strip becomes header-inline; delete the standalone strip but keep all tab actions/shortcuts), `FileTreeSidebar` (248px, count badges, collapse/restore per spec), document column typography in `MarkdownRenderer` (serif 17/1.68, 632px measure, kicker line), `TableOfContents`, and `Toast`. Raw/source views stay within their owning renderers rather than a separate `RawViewer` surface.
- Landing rebuild in `FilePicker`: asymmetric poster hero (three stacked actions + drop + recents), geometric product art, and numbered Bauhaus chapters per `02-screens.md` §1. Do not retain the legacy centered-card landing structure.
- Presentation mode re-skin (`PresentationMode`).

**Acceptance**

- Visual parity with prototype states `#host` (minus range highlights), landing top+scroll, `#present`, dark mode — side-by-side eyeball at 1600×1000.
- All existing tests pass after selector/CSS changes; `TabBar` removal covered by updated tests.
- Automated contrast audit script (add `scripts/` or a Vitest suite computing WCAG ratios from token values) passes both themes.

## Phase 2 — The comment system (core)

**Scope**

- Extend `Comment` with `anchor` (`src/types/criticmarkup.ts`).
- Parser (`src/markup/criticmarkup.ts`): parse the `@@ "quote" @n` standalone-anchor suffix; emit anchors for wrapped `{==..==}{>>..<<}` comments (they already have positions); re-anchoring + orphan detection per `03 §4`.
- Insertion (`src/markup/insertComment.ts`): wrapped vs anchored-standalone decision per `03 §5`; raw↔plain offset mapping; unit tests for both forms, overlap cases, and no-corruption invariants.
- Rendering: segment-based highlight layer in `MarkdownRenderer`/`CommentMargin` per `03 §3` (port `applyHighlights` from the prototype into a tested pure helper + a thin DOM layer; keep it framework-idiomatic — e.g. compute segments in TS, render spans via React rather than post-hoc DOM surgery if feasible).
- Composer rework (selection capture per `03 §2`, type keys 1–6, quote line, honesty footer).
- Rail rework (`CommentPanel`, `CommentThreadCard`, `CommentCard`): filters incl. Resolved history, grouping, selection sync, orphan note.
- Special blocks (`MarkdownRenderer`, `CodeCommentSurface`, `MermaidBlock`):
  code-fence line gutter with CSS-only numbers, fence-safe standalone
  serialization, Mermaid diagram/source views, source-based node anchors, and
  diagram rings/pins.
- Keyboard: J/K, C, Esc chain; command palette component (new `src/ui/components/CommandPalette/`) with the action registry.

**Acceptance**

- Round-trip test: select mid-sentence span → comment → file contains valid CriticMarkup → reload → identical anchor.
- Overlap test: two comments on intersecting ranges → three visual segments; middle segment shows both tints + two stripes; click-cycle works; resolving one restores the other's clean rendering; file stays valid CriticMarkup throughout (second comment serialized as anchored standalone).
- Orphan test: externally edit the anchored text → comment shows released note, no mis-highlight; restore text → re-attaches.
- Parser edge suite extended: anchored suffix with quotes/escapes, occurrence >1, adjacent/nested-looking spans, CriticMarkup in code blocks still ignored.
- Special-block round trips: fence bytes remain unchanged with the standalone
  anchor after the closing fence; Mermaid node anchors resolve in both views,
  orphan on rename, and reattach when restored. The same anchors work in peer
  mode.
- Perf: comment add/resolve re-render < 100ms on a 10k-line fixture (Vitest benchmark or manual profile note).

## Phase 3 — Sharing & peer mode

**Scope**

- Share sheet (keep the former `SharedPanel` responsibilities merged into `ShareDialog`; keep `src/modules/sharing/controller.ts` flows).
- Peer takeover re-skin: trust ribbon, identity chip, "Your comments" tray with sent/draft states, name sheet (`PeerNamePrompt`), `ConnectionStatus` chip states, `ContentUpdateBanner` unchanged semantics.
- Peer payload: add `quote`/`occurrence` to comment `block_ref` (additive, versioned); host merge uses Phase-2 insertion.

**Acceptance**

- Existing peer/relay integration tests green; new test: peer range comment → host merge → wrapped-or-anchored CriticMarkup correct under overlap.
- Peer mode works in a non-Chromium browser (manual pass, Firefox + Safari).

## Phase 4 — Agent loop & polish

**Scope**

- Run card + comment run-states + `diffline` streaming styles + terminal drawer re-skin (`AgentTerminal`, `AgentSettingsDialog`, host-review controller).
- Palette actions for agent flows; ⌘⏎; run-complete toast; orphan behavior during runs verified end-to-end.
- Final a11y sweep (04), reduced-motion audit, `HistoryDropdown`/`RestoreError`/`UndoToast` re-skins, empty states, copy pass against prototype strings.

**Acceptance**

- Desktop runtime demo: comments → run → statuses stream → resolved + teal diffs → dismiss. Web runtime shows copy-prompt equivalents, no dead controls.
- Full keyboard matrix (04) verified by an integration test where practical, manual checklist otherwise.
- Definition-of-done list in `00-brief.md` fully green.

## Testing conventions

Vitest + RTL; `setTestState`/`resetTestStore` from `src/testing/testHelpers.ts`; factories for anchored comments go into testHelpers. Pure logic (segmenter, anchor resolution, serialization) gets exhaustive unit tests; components get behavior tests; one Playwright happy-path per phase if the harness exists. Never assert on colors — assert on classes/attributes (`data-cids`, state classes).

## Out of scope (do not build)

Real-time co-editing of document text; comment reactions/mentions; mobile layouts beyond the 900px overlay-rails breakpoint; migrating stored shares; server-side anything.

## Suggested order of PRs

1. Tokens + shell (Phase 1, mergeable behind nothing — it's a re-skin)
2. Landing
3. Parser + insertion + types (no UI)
4. Highlight segmenter + composer + rail
5. Palette + keyboard
6. Share + peer
7. Agent loop + polish

Keep PRs reviewable (< ~800 lines diff where possible); each lands with its tests.
