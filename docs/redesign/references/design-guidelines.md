# Design-Guideline Research — Lollipop Dragon redesign

Web research, July 2026. Fetched sources listed at the end.

## 1. Long-form reading typography

- **Line length 45–90 characters**, sweet spot 50–75, classic optimum ~66 CPL; WCAG caps at 80. Implementation: `max-width: 66–70ch` on the markdown column (Butterick, Baymard).
- **Font size 16–18px minimum** on desktop; modern reading apps use 17–19px (iA).
- **Line height 140–160%**; 1.5 baseline, up to 1.7 for wide measures.
- **Serif vs sans is tonal, not functional** above ~12px. Pairing: quality serif for the rendered document (signals "document"), UI sans for chrome and comments (signals "tool"). Linear pairs Inter Display headings + Inter body.

## 2. Color systems (light/dark)

- **Never pure black or white.** Dark base #0A0A0A–#161616; dark-mode body text #E0E0E0–#F0F0F0 (halation otherwise).
- **Elevation = luminance in dark mode, shadow in light.** ≥4 surface levels, +5–8% luminance per step.
- **Semantic tokens** (`--color-{role}-{state}`), ideally in OKLCH; Linear generates whole themes from 3 variables.
- **Contrast:** 4.5:1 body text, 3:1 large text/UI components — in both themes.
- **Accents sparingly:** near-monochrome chrome + one accent; raise text contrast instead of adding color.
- **6+ category colors:** constant-luminance hue rotation, +10–20% saturation in dark mode, never color-only (pair with labels/icons).

## 3. Annotation / comment UI

- **Two-part anchor model** (Google Docs standard): subtle inline highlight + margin/panel card, bidirectionally linked.
- **Respect the page:** low-opacity highlights at rest; full emphasis on hover/focus only (Critchlow).
- **Density:** collapse stacked comments to counted indicators; expand on click.
- **Threads:** root + flat replies; anchored quote at top; Resolve archives with undo, moves to a Resolved filter.
- **Progressive disclosure:** essentials first (text, author, resolve); edit/delete/copy-link behind hover; max two levels (NN/g).

## 4. Layout

- Canonical three-pane: left nav / center content / right context — Linear's "inverted L" of chrome around content.
- Left sidebar ~256px (shadcn default; 240–280 range); right prose rail ~300–360px; content column keeps its `ch` measure.
- Collapsible panels with shortcuts (Cmd+B convention; mirror for right rail); persist state.
- Focus/presentation modes: keep a visible exit and contextual selection-triggered affordances (NN/g zen-mode warning).

## 5. Motion

- Durations: 50–200ms micro-feedback, 250–400ms panels, 450–600ms mode transforms (Material 3).
- Easing: standard `cubic-bezier(0.2, 0, 0, 1)`; emphasized-decelerate for entries.
- Full `prefers-reduced-motion` support; keep state feedback, drop decorative motion.

## 6. What makes 2025–26 tools feel modern

Restraint over decoration: reduced chrome color, high text contrast, pixel-level alignment discipline, opacity steps instead of extra grays, 1px low-contrast borders over shadows, keyboard-first everything (⌘K), instant-feeling (<100ms) interactions. "Dense but calm."

## Checklist applied to Lollipop Dragon

1. Body: 66–70ch, 17px, 1.68 line height.
2. Serif document / sans tool / mono for agent-facing strings.
3. Semantic tokens with light+dark values (see `mockups/tokens.css`).
4. Warm paper light theme; warm charcoal dark theme; no pure black/white.
5. Four elevation surfaces per theme.
6. AA contrast both themes; category colors re-tuned for dark.
7. One accent (dragon red) for act-here; teal reserved for agent/live.
8. Comments: quiet highlight + linked margin marker + panel card.
9. Resolve = archive with history, never delete.
10. Left rail 248px, right rail 332px, both collapsible.
11. Motion 120/200/300ms, standard easing, reduced-motion supported.

**Fetched sources:** practicaltypography.com/line-length.html · baymard.com/blog/line-length-readability · ia.net/topics/responsive-typography-the-basics · linear.app/now/how-we-redesigned-the-linear-ui · muz.li dark-mode design systems guide · tomcritchlow.com/2019/02/12/annotations · nngroup.com/articles/progressive-disclosure · nngroup.com/articles/zen-mode · ui.shadcn.com/docs/components/sidebar · Material Components Motion.md · web.dev/articles/prefers-reduced-motion.
