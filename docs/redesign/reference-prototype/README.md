# Lollipop Dragon — Interactive Design Prototype

Vanilla HTML/CSS/JS, no build step, no dependencies. **Open `index.html` in any browser** (double-click works — everything runs from `file://`).

The prototype demonstrates the full "Reading Room" design from the proposal deck with real interactions and simulated data. Nothing touches disk or network.

## The demo script (2 minutes)

1. **Landing** → click **Open a folder**. (Scroll down first if you like — the classic Bauhaus feature story lives below the fold: shape-marked feature list, "two ways to collaborate" teal/red split, and the lollipop-recipe footer, all retuned to the new palette.)
2. **Read** — click files in the tree; comment counts live on the tree, tabs, and rail.
3. **Comment** — select any span of text (or hover a block and press the `+`, or hit `C`). Pick a type with keys `1–6`, write, `⌘↵`. Watch the marker, rail card, and counts appear.
   - **Anchors are character-precise** — a word, half a sentence, anything. Not lines, not blocks.
   - **Overlaps are first-class** — select text that's already commented (try the Recommendation paragraph, which ships with a fix and a clarify sharing a span). Each comment keeps its own colored underline stripe; the shared span reads darker; clicking a shared span cycles through its comments.
   - **Orphan grace** — if the agent rewrites anchored text, the comment keeps its quote and shows "anchor released" instead of mis-highlighting or vanishing (visible mid-agent-run on the clarify comment).
4. **Triage** — `J`/`K` walk comments across files; click a card or a highlight to jump either way; hover a card to **Resolve**; filter chips by type / Resolved.
5. **Run agent** — the hero moment. Comments queue → in-progress → resolved, edits stream into the page as teal diffs, the terminal drawer narrates. Stop or dismiss when done.
6. **Share** — the share sheet: scope, expiry, encrypted-link explanation, active shares with revoke.
7. **⌘K** — the command palette; try typing "agent", "dark", or a file name.
8. **Peer mode** — from landing ("Paste a review link") or the palette. Name prompt → trust ribbon → own-comments tray with ✓ sent states.
9. **Present** — the ▶ button or `⌘P`. Open `roadmap.md` first for a 3-slide deck. Arrows navigate, `Esc` exits.
10. **Dark mode** — moon icon anywhere, including mid-presentation.

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
| `⌘P`      | presentation mode                     |
| `Esc`     | close topmost thing                   |

## Deep links (for demos & screenshots)

`index.html#host` · `#peer` · `#present` · `#host-agent` (auto-runs the agent) · `#host-composer` · `#host-share` · `#host-palette` · `#host-dark`

## Files

- `tokens.css` — the design system (both themes, comment taxonomy, all component styles). This is the implementable artifact.
- `proto.css` — interaction states, overlays, motion (with `prefers-reduced-motion` support).
- `app.js` — state, rendering, and the simulations (agent run, sharing, peer flow).
- Clicking the logo (or the palette's "Reset demo") restores the initial data.
