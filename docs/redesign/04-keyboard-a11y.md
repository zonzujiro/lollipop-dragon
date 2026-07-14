# 04 — Keyboard & Accessibility

## Keyboard matrix

`⌘` = `Ctrl` on Windows/Linux (`metaKey || ctrlKey`). Single-letter shortcuts fire only when focus is not in an input/textarea.

| Key                             | Context                               | Action                                                                                     |
| ------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `J` / `K`                       | host                                  | next / previous open comment (crosses files; ordering per 03 §7)                           |
| `C`                             | host, peer                            | open composer on the hovered block (fallback: selected comment's block, else first block)  |
| text selection                  | host, peer                            | opens composer with a character-range anchor                                               |
| `1`–`2`                         | composer open, focus outside textarea | set comment type (`1` = clarify, `2` = rewrite)                                            |
| `⌘↵`                            | composer textarea                     | submit comment                                                                             |
| `⌘↵`                            | host, no composer                     | run agent on open comments (desktop runtime)                                               |
| `⌘K`                            | everywhere                            | command palette (toggle)                                                                   |
| `⌘B`                            | host                                  | toggle file rail                                                                           |
| `⌘\`                            | host                                  | toggle comment rail                                                                        |
| `⌘P`                            | host                                  | presentation mode (preventDefault on browser print)                                        |
| `⌘W` / `⌘T` / `Ctrl+Tab`        | host                                  | close / new / cycle workspace tabs (existing)                                              |
| `←→↑↓ Space PgUp PgDn Home End` | presentation                          | navigate slides (no wrap)                                                                  |
| `↑` `↓` `↵`                     | palette                               | select / run                                                                               |
| `↵`                             | peer name sheet                       | join                                                                                       |
| `Esc`                           | everywhere                            | close topmost layer, in order: palette → share sheet → composer → selection → presentation |

Every action reachable by mouse must also be reachable via the palette (⌘K). The rail footer hint bar permanently shows `J K · C · ⌘K`.

## Focus rules

- Composer opens → focus lands in the textarea; Esc/submit returns focus to the document.
- Palette opens → focus in search input; closing restores prior focus.
- Sheets (share, peer name) trap focus; Esc closes (peer name sheet may also be dismissed only before first join).
- Markers, highlight spans, cards, tree rows, tabs, chips: real buttons/links or `tabindex="0"` + Enter/Space activation, with `:focus-visible` rings (2px accent, 2px offset).
- Highlight spans: `role="button"`, `aria-label` = "N comments: <type by author>, …; Enter to select/cycle".

## Screen reader / semantics

- Rail is `role="complementary"` labeled "Comments"; cards are articles with type+author+state in the accessible name.
- Live regions: toast container `aria-live="polite"`; agent run card progress `aria-live="polite"` (throttled to state changes, not percentages).
- Kicker "being edited by <agent>" also announced via the run card, not color alone.
- Orphan note text is inside the card (not a tooltip).

## Contrast & visual a11y budget

- Body text ≥ 4.5:1; secondary/muted text ≥ 4.5:1 at its size or ≥ 3:1 if ≥ 18.66px bold; UI components, focus rings, taxonomy underline stripes ≥ 3:1 against their background — **in both themes** (automated check required, see 05 §testing).
- Highlights never rely on tint alone: the underline stripe(s) carry the type signal; the type tag carries the name.
- Hit targets ≥ 24×24px (markers are 26px; chips 24px height).
- Zoom to 200% must not lose content (reading column re-flows; rails become toggleable overlays below ~900px width).

## Reduced motion

With `prefers-reduced-motion: reduce`: no marker pulse, no slide/panel translation (crossfade or instant), no spinner rotation (use static progress text), keep progress-bar width changes and state color changes.
