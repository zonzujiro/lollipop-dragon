# 01 — Design System "Reading Room"

The shipped palette is **Mono Highlighter** and lives in [`src/ui/styles/tokens.css`](../../src/ui/styles/tokens.css) — treat that file as authoritative; the values below are kept in sync with it. (The original warm scheme is preserved in [`reference-prototype/`](reference-prototype/) as a historical snapshot.) The repo themes via CSS custom properties + a `.dark` override class, and palette literals remain centralized in that one file. This doc explains intent and the values that must not drift.

## Identity

The mascot logo (`src/assets/lollipop-dragon-logo.svg`) stays as the brand stamp, while **Mono Highlighter** gives the product a neutral reading environment with one fluorescent editorial signal: yellow for agent activity (palette decision 23.07.2026). Two registers coexist deliberately:

- **The app (Reading Room)**: white paper, near-black ink, neutral chrome, and a yellow agent highlighter — title-case, restrained.
- **The landing story (Bauhaus)**: lowercase display headings, geometric shapes (square/circle/triangle markers), flat monochrome bands, and the same yellow highlight. Its layout language is landing-only, while its colors come from the active light/dark app theme.

## Color

| Token                      | Light                 | Dark                  | Use                                           |
| -------------------------- | --------------------- | --------------------- | --------------------------------------------- |
| `--bg`                     | `#F2F2F0`             | `#121212`             | neutral app chrome                            |
| `--bg-sunken`              | `#E8E8E4`             | `#0B0B0B`             | rails, wells, code blocks                     |
| `--surface`                | `#FFFFFF`             | `#1B1B1A`             | document page, cards                          |
| `--surface-raised`         | `#FFFFFF`             | `#232322`             | popovers, sheets                              |
| `--ink`                    | `#191919`             | `#F2F2EE`             | primary text                                  |
| `--ink-secondary`          | `#555553`             | `#BCBCB6`             | secondary text                                |
| `--ink-muted`              | `#6D6D69`             | `#90908A`             | hints, metadata                               |
| `--line` / `--line-strong` | `#DCDCD8` / `#C4C4BF` | `#333330` / `#4A4A46` | hairlines                                     |
| `--accent`                 | `#1B1B1B`             | `#F2F2EE`             | primary actions, selection, unread            |
| `--agent`                  | `#DDB109`             | `#F3CF50`             | agent activity and the highlighter identity   |
| `--avatar-neutral`         | `#6D6D69`             | `#6D6D69`             | neutral reply avatars                         |
| `--on-accent`              | `#FFFFFF`             | `#171717`             | glyphs and compact labels on primary controls |
| `--on-rewrite`             | `#191919`             | `#171717`             | compact labels on rewrite-colored controls    |

Rules: near-black carries primary actions; yellow is reserved for agent/highlighter activity; white is the light document and raised surface. Elevation in dark mode = lighter surface (4 levels), in light mode = hairline + subtle shadow.

### Comment taxonomy colors

| Type     | Light     | Dark      | Meaning                                                             |
| -------- | --------- | --------- | ------------------------------------------------------------------- |
| fix      | `#B6322A` | `#FF7668` | something is wrong — correct it                                     |
| rewrite  | `#A18100` | `#F3CF50` | right idea, wrong words                                             |
| expand   | `#315FAE` | `#83A8FF` | true but incomplete — go deeper                                     |
| clarify  | `#A34B69` | `#E08CAB` | ambiguous — make it precise                                         |
| question | `#187582` | `#5AC1CB` | needs an answer, opens a thread                                     |
| answer   | `#2D7659` | `#72CF9B` | the reply — often from the agent                                    |
| note     | `#2D7659` | `#72CF9B` | context that does not request a change or answer                    |
| remove   | `#B6322A` | `#FF7668` | doesn't belong — cut it (destructive red; user decision 15.07.2026) |

Each has a `-soft` translucent variant (see tokens.css) used for text tints and badge backgrounds. Every type must hold ≥3:1 contrast against `--surface` in both themes — dark values are deliberately lifted/saturated. Color is never the only signal: type name always appears in the tag. New comments offer **note (default) · question · clarify · rewrite · remove**; legacy types stay readable. Contrast tests parse the actual `:root` and `.dark` declarations from `tokens.css`; they must never mirror a second literal palette in test code.

## Typography

| Register        | Stack                                                             | Values                                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document body   | `ui-serif, "New York", "Iowan Old Style", Georgia, serif`         | 17px / 1.68, max-width **1450px reading pane**, centered — deliberately wider than the 66ch guideline to support long technical documents (product decision, 15.07.2026; matches the previous Lollipop UI) |
| Doc headings    | same serif                                                        | h1 34/1.2 · h2 23/1.3, −0.01em tracking                                                                                                                                                                    |
| UI chrome       | `-apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif` | 11–14px, weights 500–750                                                                                                                                                                                   |
| Mono            | `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace`     | file paths, type tags, kickers, CriticMarkup, code 13px                                                                                                                                                    |
| Landing display | UI sans, weight 800, lowercase, −0.02em                           | landing sections only                                                                                                                                                                                      |

The serif/sans split is semantic: serif = the document, sans = the tool, mono = what the agent reads. Don't blur it.

## Metrics

- Radii: 6 / 10 / 14px (`--radius-s/m/l`); pill = height/2.
- Header height 52px. Left file rail 248px; right comment rail 332px; both collapsible with persisted state.
- Spacing on a 4/8px grid. Blocks: 18px gap; h2 gets +36px top.
- Hairline borders (1px `--line`) over shadows for in-canvas separation; `--shadow-pop` only for floating layers (popovers, sheets, palette).

## Motion

| Class                    | Duration | Easing                                                  |
| ------------------------ | -------- | ------------------------------------------------------- |
| hover, toggles           | 120ms    | `cubic-bezier(0.2, 0, 0, 1)`                            |
| popovers, cards, toasts  | 200ms    | emphasized-decelerate `(0.05, 0.7, 0.1, 1)` for entries |
| panels, mode transitions | 300ms    | standard                                                |

Nothing in the core loop exceeds 400ms. `prefers-reduced-motion: reduce` → panels/popovers crossfade or appear instantly; keep state feedback (e.g. progress bar width) but kill decorative movement (marker pulse, panel transitions).

## Iconography

1.5–2.4px stroke outline icons, 13–16px, `currentColor` (see inline SVGs in the prototype). Extend the existing `src/ui/components/Icons/Icons.tsx` set; keep stroke style consistent.
