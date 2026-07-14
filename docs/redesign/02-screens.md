# 02 — Screens & Flows

Every surface, its layout and states. Pixel truth: `reference-prototype/` (open `index.html`; deep links per its README). Component names in parentheses refer to existing components in `src/ui/components/` that own the surface today.

## 1. Landing (`FilePicker`)

A single scrollable page combining a functional hero with the classic Bauhaus feature story.

**Above the fold (100vh hero):**

- Quiet Bauhaus geometry in the background corners (outlined teal circle, soft red disc, amber quarter-circle, teal triangle — low opacity, never behind the cards).
- Centered: dragon logo → serif "Lollipop Dragon" → tagline "Read what your agent wrote. Say what to change. Watch it happen."
- Three entry cards: **Open a folder** (accent-ringed, primary), **Open a file**, **Paste a review link** (teal icon; opens peer flow). Cards show ⌘O / ⌘⇧O hints.
- Dashed drop-zone hint ("…or drop a folder anywhere on this window") — drag-and-drop of a directory must work.
- Recents row (from file history, `HistoryDropdown` data): pills with type icon, name, open-comment badge, share count.
- Top-right: honest browser note. Bottom-center: "what it does ↓" anchor link scrolling to the feature story.

**Below the fold (Bauhaus story — keep existing copy):**

- Cream band, id `landing-features`: heading "reads everything your agent writes" (lowercase, 800 weight) + geometric document illustration + 8-item feature list with rotating square/circle/triangle markers in accent/teal/amber: inline criticmarkup comments · threaded questions & answers · mermaid diagrams & code · gfm tables & task lists · tabs for files & folders · encrypted file or folder sharing · live peer comments · local review works offline.
- Black band: "two ways to collaborate".
- Split band: teal **with ai** (comments live in the markdown · any agent can read criticmarkup · copy instructions for questions · answers render as inline threads) and dragon-red **with people** (one encrypted share link · live reviewer comments · no account needed · merge or dismiss with one click), each with a small geometric composition.
- Black footer: "dragon's favorite lollipop" + the recipe easter egg + shape trio. Keep it.

The old landing's `bauhaus` palette (`#E63946/#FFB800/#1D3557`) is **retired** — reuse the copy and geometry language, recolored to accent/teal/amber tokens.

## 2. Host frame

`Header` (52px): brand mark+wordmark (left) · **workspace tabs inline in the header** (replaces the separate `TabBar` strip) · right actions: peers-online chip + presence avatars (only when a share with connected peers exists), Share button, **Run agent** (primary, desktop runtime only), Present icon, theme toggle, comment-rail toggle. Tabs: folder/file icon, label, open-comment count badge (accent pill), ×, and a `+` tab. Active tab = raised surface + hairline.

Left **file rail** (248px, `FileTreeSidebar`): workspace name header + collapse control; tree with directories bold, files with open-comment count badges (accent-soft pill, hidden at zero). Active file = raised row. Collapsed → slim restore button floats at the document's top-left edge (per `docs/features/multi-tab.md` §8). Hidden entirely for single-file workspaces.

Center **document** (`MarkdownRenderer`): mono kicker line (path · "updated N min ago by <agent>" · turns teal "being edited by <agent>" during a run) above a serif reading column (66ch). Each block wrapped with a margin lane at its left: comment markers (26px rounded squares, type-colored dot, stacked when multiple, `fresh` pulse on arrival) + a dashed `+` add affordance on block hover. Highlight rendering per `03-commenting-spec.md`.

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
