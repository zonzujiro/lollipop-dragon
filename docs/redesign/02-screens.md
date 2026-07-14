# 02 — Screens & Flows

Every surface, its layout and states. Pixel truth: `reference-prototype/` (open `index.html`; deep links per its README). Component names in parentheses refer to existing components in `src/ui/components/` that own the surface today.

## 1. Landing (`FilePicker`)

**Concept: a Bauhaus poster that works.** A ground-up redesign — do not port the old landing's sections. It keeps two ideas from it: the Bauhaus design language, and "what it does" feature storytelling. Landing-only visual rules: **sharp corners (no border-radius), 3px ink rules, flat color planes, hard offset shadows (`5px 5px 0 ink`), lowercase 800–900-weight display type, square/circle/triangle as the only ornament**. Palette = the app tokens (accent red / teal / amber / cream / ink); the old `#E63946/#FFB800/#1D3557` palette is retired.

**Hero (100vh, asymmetric two-column grid):**

- Left: the real dragon logo as a small brand stamp (~46px, `title="yes, it's a dragon"` easter egg) → mono kicker "■ local-first markdown review" → giant lowercase wordmark, "lollipop" solid ink over "dragon" as red outlined type (`-webkit-text-stroke`) → tagline → three stacked flat action buttons with hard shadows: **open a folder** (red, ⌘O), **open a file** (outline, ⌘⇧O), **paste a review link** (teal, "no install" — opens the peer flow). Shape glyph per action (■ ● ▲). Hover: translate(−2,−2) + deeper shadow; active: pressed. Below: "recent" chips (from file history, `HistoryDropdown` data) with open-comment count.
- Right: geometric lollipop-dragon composition (SVG from brand primitives: teal/cream/red concentric circles on an amber stick, triangle wings) beside a bordered page miniature that already shows **two overlapping comment ranges** (red + violet translucent bars with separate underline stubs) — the product thesis drawn as art.
- Bottom edge: full-width ink strip — left "what it does ↓" (anchors to `#landing-features`), right the honest browser note. Directory drag-and-drop onto the window must still work.

**"What it does" — numbered chapters (fresh copy, not the old feature list):**

- **01 · reads like a book** (cream band, giant ink numeral): rendering copy; six bordered feature tiles with shape markers — mermaid diagrams · highlighted code · gfm tables & task lists · tabs for files & folders · presentation mode · local & offline; geometric page art.
- **02 · say it with types** (black band, outlined numeral): comments-as-instructions copy; the six taxonomy chips as flat color blocks (fix/rewrite/expand/clarify/question/remove); a second line selling range anchoring — "anchor to half a sentence… overlaps are welcome"; overlap art (two translucent bars crossing text bars, intersection reading darker).
- **03 · hand it off** (cream band): two hard-shadow panels — teal **to your agent** (one keystroke sends every open comment · watch edits stream back in, live · answers come back as threads) and red **to your people** (one encrypted link, no accounts · comments land in your margin live · merge or dismiss with one click); the red panel staggered lower for asymmetry.
- **04 · private by construction** (black band, geometric padlock art): the privacy story in three shape-marked statements — your files stay on this device (in-browser, straight from disk, no upload, works offline) · sharing is end-to-end encrypted (key lives in the link, never sent to a server; storage sees only ciphertext and purges on expiry) · no accounts, no telemetry. The hero's ink strip also leads with "your files stay on this device".
- **CTA band**: giant "start reading" + the red open-a-folder button again.
- **Footer** (ink): shape trio + "dragon's favorite lollipop" + the recipe easter egg in small mono.

## 2. Host frame

`Header` (52px): brand mark+wordmark (left) · **workspace tabs inline in the header** (replaces the separate `TabBar` strip) · right actions: peers-online chip + presence avatars (only when a share with connected peers exists), Share button, **Run agent** (primary, desktop runtime only), Present icon, theme toggle, comment-rail toggle. Tabs: folder/file icon, label, open-comment count badge (accent pill), ×, and a `+` tab. Active tab = raised surface + hairline.

Left **file rail** (248px, `FileTreeSidebar`): workspace name header + collapse control; tree with directories bold, files with open-comment count badges (accent-soft pill, hidden at zero). Active file = raised row. Collapsed → slim restore button floats at the document's top-left edge (per `docs/features/multi-tab.md` §8). Hidden entirely for single-file workspaces.

Center **document** (`MarkdownRenderer`): mono kicker line (path · "updated N min ago by <agent>" · turns teal "being edited by <agent>" during a run) above a serif reading column (66ch). Each block wrapped with a margin lane at its left: comment markers (26px rounded squares, type-colored dot, stacked when multiple, `fresh` pulse on arrival) + a dashed `+` add affordance on block hover. Highlight rendering per `03-commenting-spec.md`. Code blocks grow a hover line-number gutter (click a number = comment that line); Mermaid blocks get a diagram/source toggle above them, clickable nodes, and ring-plus-pin comment decorations (03 §8).

Right **comment rail** (332px, `CommentPanel`): "Comments · N open (· M resolved)" header; filter chips (All / per-type with counts / Resolved); cards grouped under mono file-path headers in document order. Card (`CommentThreadCard`): 3px type-colored left border, type tag + author + relative time, italic serif quote (truncated 1 line), body, thread replies (avatar + author + text), hover actions (Resolve ✓). Selected card = type-colored ring; resolved = dimmed + strikethrough. Dashed "N resolved — kept for history, one click away" strip links to the Resolved filter. Footer hint bar: `J K next/prev · C comment · ⌘K commands`.

## 3. Composer (replaces `AddCommentPopover`-style popup)

Floating card (390px, raised surface, drag handle) anchored under the target block: italic serif quote line with type-colored left rule (when a range is anchored) → type chip row (fix/rewrite/expand/clarify/question/remove, keys 1–6, selected chip fills with type-soft) → textarea (placeholder = the selected type's meaning, e.g. "something is wrong — correct it…") → footer: honesty line **"Written into the file as CriticMarkup"** (peer mode: "Sent to the host — encrypted") + primary button `Comment ⌘↵`. Esc dismisses; click-outside dismisses; one composer at a time (opening another closes the first — matches the existing single-active-input rule).

## 4. Share sheet (`ShareDialog` + `SharedPanel`, merged)

One centered sheet (560px) over a blur scrim: scope segmented control (This file / Whole folder · N files) → Expires + "Reviewers can" selects → teal link box: lock label "Encrypted link — key never leaves the URL", mono URL with dimmed `&key=` fragment, **Copy link** + "Copy as Slack message" → shield keynote explaining the #fragment in one sentence → sunken "Active shares · this workspace" list: rows with name, meta (kind · created · expires), pending-comment / peers-viewing badge, Revoke link. Copy actions morph label to "Copied ✓" + toast.

## 5. Agent run (desktop runtime; `AgentTerminal` + run card)

Trigger: header Run agent, ⌘⏎, or palette. Run card pinned above the rail list: spinner, "«agent» is addressing N comments", target dirs + started time, Stop, progress bar (agent-teal), "X of N resolved · 1 in progress · Copy prompt". Comment cards gain states: `○ queued` (muted) → `● in progress` (amber ring) → `✓ resolved`/`✓ answered` (teal, dimmed, strikethrough). Document edits stream in with `diffline` styling (agent-soft background + 3px teal left inset); kicker turns "being edited by …". Terminal drawer (168px, `#14110E`, mono 11.5px) docks below the document, collapsible to its 34px title bar. On completion: card flips to "Run complete — N comments addressed · Dismiss", toast, teal diffs remain until next content refresh. Statuses map to the existing run model (active/completed/failed/stopped/needs-attention) from `docs/features/desktop-agent-client.md`; web runtime shows Copy-prompt affordances instead of Run.

## 6. Command palette (new)

⌘K over a blur scrim, 580px, top-aligned (~110px): search input; grouped fuzzy-filtered items (Review / Navigate / View / …): run agent with open-comment count (top hit), share, files with open counts, toggle theme/sidebar/rail, presentation. ↑↓ + ↵; Esc closes. Every user-reachable action must be registered here.

## 7. Peer mode (link takeover)

First visit: name sheet ("Join the review", host name + workspace, single input, "Start reviewing", note: "No account is created…"). Then: 34px teal-soft **trust ribbon** — lock icon, "Shared by <host> · end-to-end encrypted · expires in N days · read & comment". Header: brand, workspace name · file count, connection chip (Live · host online / Offline — comments queue via `ConnectionStatus` states), identity chip ("Reviewing as <name>" + avatar), **Save copy**, theme. Left: shared-files tree (no badges). Document: same reading experience; commenting allowed (same composer, "Send comment"); no host powers (no resolve, no other reviewers' comments, no agent). Right rail = **"Your comments"** tray: sent cards (`✓ sent` after relay ACK, file path as subtitle) and dashed `draft` cards; empty state invites selection. Stale-content and auto-refresh behavior unchanged from `docs/features/realtime-comments/spec.md` (`ContentUpdateBanner`).

## 8. Presentation mode (`PresentationMode`)

Unchanged mechanics (split on `#`/`---`, fullscreen, arrows, wrap-none). Re-skinned: slides on `--bg` with serif display type (h1 52px), mono kicker "<file> · slide N", right-edge dot rail (active dot = accent 9×24 capsule), fading × (top-right) and theme fab (bottom-right), mono counter bottom-left, key hints bottom-center.

## 9. Dark mode

Token swap only — no component-specific colors. Verify: Mermaid/code re-theme via tokens, taxonomy colors switch to lifted variants, logo legible on charcoal.

## 10. Toasts (`Toast`)

Bottom-center ink-on-paper pills (inverted), teal ✓ for confirmations, 200ms in / auto-dismiss ~2.5s, stack vertically. All texts in the prototype are copy-approved.
