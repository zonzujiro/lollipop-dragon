# 01 — Design System "Reading Room"

The machine-readable source of truth is [`assets/tokens.css`](assets/tokens.css). Port it into `src/ui/styles/tokens.css` as CSS custom properties (the repo already themes via variables + a `.dark` override class). This doc explains intent and the values that must not drift.

## Identity

Seeded from the dragon logo (`src/assets/lollipop-dragon-logo.svg`): cream from its belly, red from the lollipop, teal from the wings. Two registers coexist deliberately:

- **The app (Reading Room)**: warm paper, serif documents, quiet chrome — title-case, restrained.
- **The landing story (Bauhaus)**: lowercase display headings, geometric shapes (square/circle/triangle markers), flat color bands. Landing-only; never inside the app shell.

## Color

| Token                      | Light                 | Dark                  | Use                                                     |
| -------------------------- | --------------------- | --------------------- | ------------------------------------------------------- |
| `--bg`                     | `#F6F2E9`             | `#171412`             | app background ("paper" / "charcoal")                   |
| `--bg-sunken`              | `#EFEADD`             | `#100E0C`             | rails, wells, code blocks                               |
| `--surface`                | `#FFFDF8`             | `#1F1B18`             | document page, cards                                    |
| `--surface-raised`         | `#FFFFFF`             | `#262220`             | popovers, sheets                                        |
| `--ink`                    | `#211D18`             | `#EDE6D9`             | primary text                                            |
| `--ink-secondary`          | `#575046`             | `#B5AC9E`             | secondary text                                          |
| `--ink-muted`              | `#8A8175`             | `#7E766A`             | hints, metadata                                         |
| `--line` / `--line-strong` | `#E4DCCB` / `#CFC5B0` | `#322D28` / `#453E37` | hairlines                                               |
| `--accent`                 | `#D93030`             | `#E85A5A`             | **the only accent**: primary actions, selection, unread |
| `--agent`                  | `#2E9678`             | `#4CBA9A`             | agent activity, live connection, success                |

Rules: never pure black/white; elevation in dark mode = lighter surface (4 levels), in light mode = hairline + subtle shadow; accent is reserved — everything else stays neutral.

### Comment taxonomy colors

| Type     | Light     | Dark      | Meaning                          |
| -------- | --------- | --------- | -------------------------------- |
| fix      | `#D93030` | `#F07272` | something is wrong — correct it  |
| rewrite  | `#C07A10` | `#E0A33E` | right idea, wrong words          |
| expand   | `#2563EB` | `#6D9BF5` | true but incomplete — go deeper  |
| clarify  | `#7C4FD0` | `#A98BE8` | ambiguous — make it precise      |
| question | `#0E8A9E` | `#4FB8CB` | needs an answer, opens a thread  |
| answer   | `#2E9678` | `#4CBA9A` | the reply — often from the agent |
| remove   | `#6E6659` | `#97907F` | doesn't belong — cut it          |

Each has a `-soft` translucent variant (see tokens.css) used for text tints and badge backgrounds. Every type must hold ≥3:1 contrast against `--surface` in both themes — dark values are deliberately lifted/saturated. Color is never the only signal: type name always appears in the tag.

## Typography

| Register        | Stack                                                             | Values                                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document body   | `ui-serif, "New York", "Iowan Old Style", Georgia, serif`         | 17px / 1.68, max-width **1450px reading pane**, centered — deliberately wider than the 66ch guideline to support long technical documents (product decision, 2026-07-15; matches the previous Lollipop UI) |
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

Nothing in the core loop exceeds 400ms. `prefers-reduced-motion: reduce` → panels/popovers crossfade or appear instantly; keep state feedback (e.g. progress bar width) but kill decorative movement (marker pulse, slide transitions).

## Iconography

1.5–2.4px stroke outline icons, 13–16px, `currentColor` (see inline SVGs in the prototype). Extend the existing `src/ui/components/Icons/Icons.tsx` set; keep stroke style consistent.
