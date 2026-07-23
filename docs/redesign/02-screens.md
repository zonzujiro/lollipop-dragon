# 02 — Screens & Flows

Every surface, its layout and states. Pixel truth: `reference-prototype/` (open `index.html`; deep links per its README). Component names in parentheses refer to existing components in `src/ui/components/` that own the surface today.

## 1. Landing (`FilePicker`)

**Concept: a Bauhaus poster that works.** A ground-up redesign — do not port the old landing's sections. It keeps two ideas from it: the Bauhaus design language, and "what it does" feature storytelling. Landing-only visual rules: **sharp corners (no border-radius), 3px ink rules, flat color planes, hard offset shadows (`5px 5px 0 ink`), lowercase 800–900-weight display type, square/circle/triangle as the only ornament**. Colors come from the same Mono Highlighter tokens as the app and follow the active light/dark theme: neutral paper, near-black primary actions, yellow agent highlights, and semantic comment colors. The old `#E63946/#FFB800/#1D3557` palette is retired.

**Hero (100vh, asymmetric two-column grid):**

- Left: the real dragon logo as a small brand stamp (~46px, `title="yes, it's a dragon"` easter egg) → mono kicker "■ local-first markdown review" → giant lowercase wordmark, "lollipop" solid ink over "dragon" as accent-outlined type (`-webkit-text-stroke`) → tagline → three stacked flat action buttons with hard shadows: **open a folder** (accent, ⌘O), **open a file** (outline, ⌘⇧O), **paste a review link** (agent, "no install" — opens the peer flow). Shape glyph per action (■ ● ▲). Hover: translate(−2px,−2px) + deeper shadow; active: pressed. Below: "recent" chips (from file history, `HistoryDropdown` data) with open-comment count.
- Right: geometric lollipop-dragon composition using the active app palette beside a bordered page miniature that already shows **two overlapping comment ranges** (question + clarify translucent bars with separate underline stubs) — the product thesis drawn as art.
- Bottom edge: full-width ink strip — left "what it does ↓" (anchors to `#landing-features`), right the honest browser note. Directory drag-and-drop onto the window must still work.

**"What it does" — numbered chapters (fresh copy, not the old feature list):**

- **01 · reads like a book** (sunken band, giant ink numeral): rendering copy; six bordered feature tiles with shape markers — mermaid diagrams · highlighted code · gfm tables & task lists · tabs for files & folders · presentation mode · local & offline; geometric page art.
- **02 · say it with types** (black band, outlined numeral): comments-as-instructions copy; two taxonomy chips as flat color blocks (clarify/rewrite); a second line selling range anchoring — "anchor to half a sentence… overlaps are welcome"; overlap art (two translucent bars crossing text bars, intersection reading darker). Threaded question/answer remains a separate collaboration flow rather than a general comment-type choice.
- **03 · hand it off** (sunken band): two hard-shadow panels — agent-colored **to your agent** (one keystroke sends every open comment · watch edits stream back in, live · answers come back as threads) and accent **to your people** (one encrypted link, no accounts · comments land in your margin live · merge or dismiss with one click); the accent panel staggered lower for asymmetry.
- **04 · private by construction** (black band, geometric padlock art): the privacy story in three shape-marked statements — your files stay on this device (in-browser, straight from disk, no upload, works offline) · sharing is end-to-end encrypted (key lives in the link, never sent to a server; storage sees only ciphertext and purges on expiry) · no accounts, no telemetry. The hero's ink strip also leads with "your files stay on this device".
- **CTA band**: giant "start reading" + the accent open-a-folder button again.
- **Footer** (ink): shape trio + "dragon's favorite lollipop" + the recipe easter egg in small mono.

The landing surface scrolls vertically through every chapter, CTA, and footer
while clipping horizontal overflow. A viewport-height hero must never make the
later sections unreachable.

## 2. Host frame

`Header` (52px): brand mark+wordmark (left) · **workspace tabs inline in the header** (replaces the separate `TabBar` strip) · right actions: peers-online chip + presence avatars (only when a share with connected peers exists), Share button, **Run agent** (primary, desktop runtime only; Copy prompt on web), Present icon, theme toggle, comment-rail toggle. Text actions and icon actions are 32px high. Share remains visible whenever a host document is open; missing relay configuration is reported inside the share flow rather than hiding the action. Tabs: folder/file icon, label, open-comment count badge (accent pill), ×, and a `+` tab. Active tab = raised surface + hairline.

Left **file rail** (248px, `FileTreeSidebar`): workspace name header + collapse control; 28px tree rows with directories bold, tiny directory chevrons, **no decorative file icons**, no legacy per-row share action, and files with open-comment count badges (accent-soft pill, hidden at zero). Tree rows carry no share indicator — sharing visibility lives in the header live chip and the Share sheet's “Active shares” list. The trailing badge/status area must never be covered by a hover control. Depth padding is 8px / 24px / 40px. Active file = raised row with a hairline and card shadow. Collapsed → slim restore button floats at the document's top-left edge (per `docs/features/multi-tab.md` §8). Hidden entirely for single-file workspaces.

Center **document** (`MarkdownRenderer`): mono kicker line (file path) above the serif reading column. The **table of contents is an edge-persistent tick minimap** at the reading column's right edge — the Notion/Linear/Dropbox-Paper convention, chosen after research (NN/g: icon-only ToC triggers go unnoticed on long documents; always-visible marks at near-zero width are the fix). One tick per heading, width by level, the in-view section's tick in accent (scroll-tracked), sections with open comments tinted. Hover or click expands it into the contents panel: headings indented by level, active section marked, per-section **open-comment counts** (accent pill) — the ToC doubles as a review map. Very long documents cap ticks to top-level headings (Linear's rule). Esc collapses; hidden below 900px; renders nothing when a document has no headings. Left edge stays reserved for comment markers. Works in host and peer mode. Each block wrapped with a margin lane at its left: comment markers (26px rounded squares, type-colored dot, stacked when multiple, `fresh` pulse on arrival) + a dashed `+` add affordance on block hover. Highlight rendering per `03-commenting-spec.md`. Code blocks grow a hover line-number gutter (click a number = comment that line); Mermaid blocks get a diagram/source toggle above them, clickable nodes, and ring-plus-pin comment decorations (03 §8).

Right **comment rail** (332px, `CommentPanel`): "Comments · N open (· M resolved)" header; filter chips (All / active question, clarify, rewrite, or remove counts / Resolved); cards grouped under mono file-path headers in document order. The rail header does not duplicate the global close toggle or expose a destructive Clear action. Card (`CommentThreadCard`): 3px type-colored left border, soft type tag + author + relative time, italic serif quote (truncated 1 line), body, thread replies (avatar + author + text), hover actions (Resolve ✓). Internal block indices are never shown as user-facing metadata. Selected card = type-colored ring; resolved = dimmed + strikethrough. Dashed "N resolved — kept for history, one click away" strip links to the Resolved filter. Footer hint bar: `J K next/prev · C comment · ⌘K commands`.

## 3. Composer (replaces `AddCommentPopover`-style popup)

Floating card (390px, raised surface, drag handle) anchored under the target block: italic serif quote line with type-colored left rule (when a range is anchored) → type chip row (question/clarify/rewrite/remove, keys 1–4, **question is the default**, selected chip fills with type-soft; remove is destructive red) → textarea → footer: honesty line **"Written into the file as CriticMarkup"** (peer mode: "Sent to the host — encrypted") + primary button `Comment ⌘↵`. Text selection first exposes a floating **Comment** action so native copy remains available; the range composer opens only when that action is used. Esc dismisses; click-outside dismisses; one composer at a time (opening another closes the first — matches the existing single-active-input rule). Legacy comment types (fix/expand) remain readable but are not offered for new comments. Question comments open threads: replies render under the root beneath an answer-colored thread rule (avatar + author + text per reply), agent replies are read-only for both edit and delete, and the root gains a `✓ answered · N` chip. **Long threads collapse to first reply + "⌄ N more replies" + last reply** (expand/collapse toggles); the selected question card shows an inline "Reply — Enter to send" input. Prototype routes: `#host-thread` (collapsed), `#host-thread-open` (expanded).

Visual verification: the composer has no legacy `Add comment` title row or
separate Cancel button; dismissal remains available through Esc and
click-outside behavior.

## 4. Share sheet (`ShareDialog`; former `SharedPanel` responsibilities merged)

One centered sheet (560px) over a blur scrim: "Share for review" heading + reviewer explanation → scope segmented control (This file / Whole folder · N files) → **1 day / 7 days / 30 days** expiry tabs (no access-level control; all shares allow reading and commenting) → agent-colored link box: lock label "Encrypted link — key never leaves the URL", locally pre-generated mono URL with a stable middle ellipsis so it remains on one line, **Copy link** + "Copy as Slack message" → shield keynote explaining the #fragment in one sentence → sunken "Active shares · this workspace" list: rows with name, meta (kind · created · expires), pending-comment / peers-viewing badge, Revoke link. The display-only truncation must never alter the complete URL copied by either action. Opening the sheet generates only the local key, document ID, and URL. The first copy action shows "Encrypting & uploading…", uploads the selected content, and copies only after success; failure copies nothing and permits retry. Existing active shares copy immediately. Copy actions morph label to "Copied ✓" + toast.

## 5. Agent run (desktop runtime; `AgentTerminal` + run card)

Trigger: header Run agent, ⌘⏎, or palette. Run card pinned above the rail list: spinner, "«agent» is addressing N comments", target dirs + started time, Stop, progress bar (agent), "X of N resolved · 1 in progress · Copy prompt". Comment cards gain states: `○ queued` (muted) → `● in progress` (rewrite ring) → `✓ resolved`/`✓ answered` (answer, dimmed, strikethrough). Document edits stream in with `diffline` styling (agent-soft background + 3px agent inset); kicker turns "being edited by …". Terminal drawer (168px, `#141A22`, mono 11.5px) docks below the document, collapsible to its 34px title bar. On completion: card flips to "Run complete — N comments addressed · Dismiss", toast, agent-colored diffs remain until next content refresh. Statuses map to the existing run model (active/completed/failed/stopped/needs-attention) from `docs/features/desktop-agent-client.md`; web runtime shows Copy-prompt affordances instead of Run.

## 6. Command palette (new)

⌘K over a blur scrim, 580px, top-aligned (~110px): search input; grouped fuzzy-filtered items (Review / Navigate / View / …): run agent with open-comment count (top hit), share, files with open counts, toggle theme/sidebar/rail, presentation. ↑↓ + ↵; Esc closes. Every user-reachable action must be registered here.

## 7. Peer mode (link takeover)

First visit: name sheet ("Join the review", host name + workspace, single input, "Start reviewing", note: "No account is created…"). Then: 34px agent-soft **trust ribbon** — lock icon, "Shared by <host> · end-to-end encrypted · expires in N days · read & comment". Header: brand, workspace name · file count, connection chip (Live · host online / Offline — comments queue via `ConnectionStatus` states), identity chip ("Reviewing as <name>" + avatar), **Save copy**, theme. Left: shared-files tree (no badges). Document: same reading experience; commenting allowed (same composer, "Send comment"); no host powers (no resolve, no other reviewers' comments, no agent). Right rail = **"Your comments"** tray: sent cards (`✓ sent` after relay ACK, file path as subtitle) and dashed `draft` cards; empty state invites selection. Stale-content and auto-refresh behavior unchanged from `docs/features/realtime-comments/spec.md` (`ContentUpdateBanner`).

## 8. Presentation mode (`PresentationMode`)

Unchanged mechanics (split on `#`/`---`, fullscreen, arrows, wrap-none). Re-skinned: slides on `--bg` with serif display type (h1 52px), mono kicker "<file> · slide N", right-edge dot rail (active dot = accent 9×24 capsule), fading × (top-right) and theme fab (bottom-right), mono counter bottom-left, key hints bottom-center.

## 9. Dark mode

Token swap only — no component-specific colors. Verify: Mermaid/code re-theme via tokens, taxonomy colors switch to lifted variants, logo legible on charcoal.

## 10. Toasts (`Toast`)

Bottom-center ink-on-paper pills (inverted), agent-colored ✓ for confirmations, 200ms in / auto-dismiss ~2.5s, stack vertically. All texts in the prototype are copy-approved.

## 11. Restore & degraded access (`RestoreError`)

For the state where a workspace's file-system handle can't be reused after a browser restart (behavioral rules in `docs/features/multi-tab.md` §10.1). Design stance: **this is a browser security feature, not an error** — rewrite (`--c-rewrite`), never remove red; name the workspace, say why, say what still works, offer the one-click fix. Prototype route: `#host-restore`.

- **Cached-content variant** (last content is available): keep rendering the persisted markdown. A full-width attention banner docks at the top of the document pane (rewrite-soft background, hairline bottom, folder-key icon): bold first sentence "Live access to “research-notes” was dropped when the browser restarted." + reassurance "Keep reading — commenting and agent runs resume once access is restored." Right side: primary solid-ink **Restore access** button (single click → permission re-request from the saved handle — no picker unless the handle is gone, per the multi-tab spec) and a quiet "Open another folder…" secondary.
- **While degraded**: block `+` affordances hidden; selection commenting, Run agent (dimmed), and share management guarded with toasts ("Read-only — restore folder access first" / "Share management resumes once folder access is restored"); the comment rail stays fully readable and gains a dashed "read-only until folder access is restored" strip with a lock glyph. Existing comments, highlights and navigation all keep working.
- **No-content variant** (nothing cached): centered placeholder in the document pane — geometric folder-key mark, heading "Reconnect “research-notes”", one honest sentence ("Browsers ask again after a restart — one click brings it back."), primary Re-open button, secondary "Open something else". Folder tabs whose last active file still exists restore that file immediately on reopen (multi-tab §10.1).
- **On success**: banner exits (200ms), toast "Access restored — commenting is back", all affordances return. On denial: banner stays, toast reports the browser's refusal — never a dead end.
- Copy rules: always name the workspace; never blame the user; never use error-red; reading is never taken away when cached content exists.
