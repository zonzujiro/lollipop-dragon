# 03 — Commenting Spec: Ranges, Overlaps, Serialization

The core behavioral upgrade. Reference implementation of §3–§4: `reference-prototype/app.js` (`seedRanges`, `isOrphan`, `applyHighlights`, `offsetIn`, the `mouseup` handler, `data-cids` click cycling).

## 1. Comment model

Extend the existing `Comment` (`src/types/criticmarkup.ts`) with an optional anchor:

```ts
interface CommentAnchor {
  quote: string; // exact plain-text excerpt, whitespace-trimmed
  occurrence: number; // 1-based index of `quote` within the block's plain text
  start: number; // derived at parse time — char offset in block plain text
  end: number; // derived at parse time
}
// Comment gains: anchor?: CommentAnchor
```

- **Block plain text** = `textContent` of the rendered block (equivalently: the block's clean markdown with all markdown/CriticMarkup syntax stripped). All offsets are in this space, so they survive inline formatting (`code`, bold, links).
- `quote` + `occurrence` are the durable identity (persisted); `start`/`end` are derived on every parse and never persisted.
- A comment without an anchor is **block-level** (existing behavior — created via the block `+` or the `C` key).

## 2. Creating a range comment

On `mouseup` with a non-collapsed selection inside a block:

1. Resolve the block containing the selection start. If the selection crosses blocks, clamp `end` to that block's end.
2. Compute `start`/`end` as character offsets within the block's content root (`Range.selectNodeContents(root); range.setEnd(node, offset); offset = range.toString().length` — see `offsetIn`).
3. Trim whitespace inward from both edges. Reject spans < 3 chars (open a block-level composer instead is acceptable) or > 300 chars (treat as block-level).
4. `quote = plain.slice(start, end)`; `occurrence` = which occurrence of `quote` in the block's plain text contains `start`.
5. Open the composer anchored to the block, quote line shown. Existing highlights under the selection are irrelevant — **overlap is always allowed**.

## 3. Rendering — overlap-aware segments

Never wrap per-comment with naive string replacement. Per block, after markdown renders:

1. Collect open, non-orphaned anchored comments; compute segment boundaries = sorted unique set of all `start`/`end`.
2. Walk the block's text nodes with a running character offset. For each node, split it at interior boundaries (`Text.splitText`) and wrap each piece covered by ≥1 comment in a `<span>` — every span therefore has a _constant_ covering set, listed in `data-cids` (document order).
3. Styling per span, derived from its covering comments in order:
   - **Tint**: stacked translucent layers, one per comment (`background-image: linear-gradient(soft, soft), …`) — overlapping spans read naturally darker.
   - **Stripes**: one bottom underline stripe per comment via inset box-shadows: comment _i_ (0-based) → `inset 0 -(2(i+1)+i)px 0 <type-color>` (2px, 5px, 8px…). Practical cap: 3 stripes; beyond that the marker stack in the margin carries the count.
   - **Selection**: if the covering set contains the selected comment, prepend a soft ring (`0 0 0 3px color-mix(in srgb, <type> 20%, transparent)`).
   - `title` = "type — author" per covering comment.
4. Margin lane: one marker per comment on the block (type-colored dot), sorted by `range.start` (block-level comments last); stacked vertically; `fresh` pulse animation on newly arrived comments.

Interaction: clicking a span selects its first covering comment; **clicking again cycles** through `data-cids`; first click on a multi-comment span toasts "N comments share this span — click again to cycle". Selecting a comment (span, marker, or rail card) strengthens only that comment's spans, highlights its marker and card, and scrolls the counterpart into view (card click → scroll doc; span click → scroll rail only).

Performance: re-segmentation is per-block; adding/resolving a comment re-renders only affected blocks. Budget: <100ms for a comment change on a 10k-line file.

## 4. Orphaning ("anchor released")

Re-anchoring runs at every parse (file change, agent edit, refresh):

1. Exact: `quote` found at `occurrence` → anchor at that position.
2. Fallback: any exact occurrence of `quote` → first one (update `occurrence`).
3. Whitespace-normalized match of `quote` → use it.
4. Otherwise the comment is **orphaned**: no highlight, no mis-highlight; marker stays on the block; rail card keeps the quote and shows "⚠ text changed underneath — anchor released, quote kept". Orphans remain open, resolvable, and agent-addressable. If a later parse matches again (e.g. undo), the anchor silently re-attaches.

## 5. CriticMarkup serialization

Files must remain valid CriticMarkup for any external tool. Two forms:

**A. Wrapped (preferred)** — when the range does not intersect any existing CriticMarkup span in the raw markdown:

```
{==<raw slice of the range>==}{>>type: comment text — Author<<}
```

Placed inline at the range position in the **raw** markdown (map plain-text offsets → raw offsets by walking the raw block and skipping markup syntax; the existing parser's position tracking already does the plain↔raw bookkeeping for extraction — reuse it for insertion).

**B. Anchored standalone (overlap fallback)** — when the range intersects any existing `{== ==}`/`{>> <<}`/other CriticMarkup span, wrapping would produce invalid nested markup. Serialize as a standalone comment appended at the end of the block, carrying the anchor in a parsable suffix:

```
{>>type: comment text — Author @@ "exact quote" @2<<}
```

Grammar: ` @@ "<quote>"` (quote is the exact excerpt, `\"` escaping) followed by optional ` @<occurrence>` (omitted when 1). Parser: strip the suffix, build the anchor, re-anchor per §4. External CriticMarkup tools simply show the whole thing as a comment — readable, degraded gracefully. Agents see the quote inline, which is exactly the context they need.

Rules:

- Comment insertion never rewrites other comments' markup. Deleting/resolving removes only that comment's own markup (`{==...==}` unwraps to its inner text).
- Optional enhancement (not required for v1): when a wrapped comment is removed and a standalone-anchored one now has a clean range, promote it to wrapped form on the next write.
- Block-level comments keep today's serialization: `{>>type: text<<}` at block end.
- Peer comments: extend the share/relay payload's `block_ref` with `{ quote, occurrence }`. Host-side merge applies the same A/B rules. (Schema change is additive; version the payload per `docs/features/peer-sharing.md` §6.)

## 6. Resolution semantics

- **Resolve** (host action or agent removing markup): comment leaves the open set, keeps history under the Resolved filter (dimmed, strikethrough), highlight and stripes disappear, remaining overlapping comments re-render with their reduced covering sets.
- `question` comments resolve as **answered** when a reply thread exists (label `✓ answered`).
- The Resolved filter is view-only history for the session/tab; it does not resurrect markup.

## 7. Navigation & ordering

Comment order everywhere (rail grouping, J/K walk) = file order in the tree → block index → `range.start` (block-level = -1, first). J/K crosses file boundaries (switches the active file, scrolls the block to center, selects marker+card+spans).

## 8. Special blocks: code fences & Mermaid

Reference implementation: `reference-prototype/app.js` (`preLines`, `decorateMermaid`, the `.mnode`/`.cl` click handlers) and demo routes `#host-mermaid`, `#host-mermaid-src`.

### Code fences

- Selection anchoring works over the code text exactly like any block (offsets in the block's plain text = the fence content; inline syntax-highlight spans don't affect offsets).
- **Line gutter:** line numbers fade in on block hover (CSS counters — they must never enter `textContent`); clicking a line number anchors a comment to that whole line (`quote` = the line, trimmed; range = its span in the block plain text). Line numbers are a UI affordance only — nothing line-based is persisted; the durable anchor stays `quote` + `occurrence`.
- **Serialization is always the anchored-standalone form placed after the closing fence.** CriticMarkup is never written inside a fence — the parser already treats fence content as opaque, and code must stay copy-pasteable/executable.
- Rendering: tints + underline stripes draw over the syntax highlighting; taxonomy colors must hold 3:1 against the code background (`--bg-sunken`) in both themes.

### Mermaid diagrams

Comments anchor against the **diagram source** — that is the text that actually lives in the markdown file. Three levels:

1. **Block-level** via the margin `+` (unchanged).
2. **Node-level:** clicking a rendered node opens the composer with `quote` = the node's label text; the range is that label's occurrence in the source. Rendering in diagram view: a type-colored ring on the node (stroke) plus a small corner **pin** (click → select; multiple comments on one node stack pins and the ring takes the first comment's color). In source view the very same comment renders as a normal text highlight.
3. **Source view:** every Mermaid block gets a `diagram / source` toggle (chips rendered outside the anchored-text root so they never pollute offsets). In source view the block behaves exactly like a code fence — selection anchoring and the line gutter included.

Orphaning: renaming a node label breaks the quote match → standard orphan grace (§4). Serialization: anchored-standalone after the block, same rule as code. Diagram re-layout can never break an anchor because nothing anchors to coordinates — only to source text.

### Hover spotlight (dense-overlap legibility)

Hovering a rail card must make that comment's exact range unmistakable even when many highlights overlap: the hovered comment's spans gain a ring (`--focus`), and **every other highlight in the document washes out** (`filter: saturate(0.1) opacity(0.3)`, ~140ms transition). Dimming the rest is what creates certainty — brightening alone cannot win against stacked tints. Comments without a range fall back to tinting their whole block. Leaving the card restores everything.
