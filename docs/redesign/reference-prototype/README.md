# Lollipop Dragon — Interactive Design Prototype

Vanilla HTML/CSS/JS, no build step, no dependencies. **Open `index.html` in any browser** (double-click works — everything runs from `file://`).

The prototype demonstrates the full "Reading Room" design from the proposal deck with real interactions and simulated data. Nothing touches disk or network.

## The demo script (2 minutes)

1. **Landing** → click **open a folder**. The landing is a Bauhaus poster: asymmetric hero (outlined wordmark, hard-shadow action buttons, geometric lollipop-dragon), then "what it does" in numbered chapters — 01 reads like a book · 02 say it with types · 03 hand it off — ending in a start-reading CTA and the recipe footer.
2. **Read** — click files in the tree; comment counts live on the tree, tabs, and rail.
3. **Comment** — select any span of text (or hover a block and press the `+`, or hit `C`). Pick a type with keys `1–6`, write, `⌘↵`. Watch the marker, rail card, and counts appear.
   - **Anchors are character-precise** — a word, half a sentence, anything. Not lines, not blocks.
   - **Overlaps are first-class** — select text that's already commented (try the Recommendation paragraph, which ships with a fix and a clarify sharing a span). Each comment keeps its own colored underline stripe; the shared span reads darker; clicking a shared span cycles through its comments.
   - **Orphan grace** — if the agent rewrites anchored text, the comment keeps its quote and shows "anchor released" instead of mis-highlighting or vanishing (visible mid-agent-run on the clarify comment).
     3b. **Diagrams & code** — open `database/migration-risks.md`: click any Mermaid node to comment it (the anchor is the node's label; the comment draws as a ring + pin), and flip the `diagram / source` toggle to see the same comment highlighted in the source text. In any code block, hover to reveal line numbers and click one to comment that whole line.
4. **Triage** — `J`/`K` walk comments across files; click a card or a highlight to jump either way; hover a card to **Resolve**; filter chips by type / Resolved.
5. **Run agent** — the hero moment. Comments queue → in-progress → resolved, edits stream into the page as teal diffs, the terminal drawer narrates. Stop or dismiss when done.
6. **Share** — the share sheet: scope, expiry, encrypted-link explanation, active shares with revoke.
7. **⌘K** — the command palette; try typing "agent", "dark", or a file name.
8. **Peer mode** — from landing ("Paste a review link") or the palette. Name prompt → trust ribbon → own-comments tray with ✓ sent states.
9. **Dark mode** — moon icon anywhere in the app.

## Keyboard map

| Key       | Action                                |
| --------- | ------------------------------------- |
| `J` / `K` | next / previous comment               |
| `C`       | comment on hovered block              |
| `1–6`     | comment type (while composer is open) |
| `⌘↵`      | submit comment · run agent            |
| `⌘K`      | command palette                       |
| `⌘B`      | toggle file sidebar                   |
| `⌘\`      | toggle comment rail                   |
| `Esc`     | close topmost thing                   |

## Deep links (for demos & screenshots)

`index.html#host` · `#peer` · `#host-agent` (auto-runs the agent) · `#host-composer` · `#host-share` · `#host-palette` · `#host-dark` · `#host-mermaid` (node comment) · `#host-mermaid-src` (same comment in source view) · `#host-restore` (degraded folder access)

## Files

- `tokens.css` — the design system (both themes, comment taxonomy, all component styles). This is the implementable artifact.
- `proto.css` — interaction states, overlays, motion (with `prefers-reduced-motion` support).
- `app.js` — state, rendering, and the simulations (agent run, sharing, peer flow).
- Clicking the logo (or the palette's "Reset demo") restores the initial data.
