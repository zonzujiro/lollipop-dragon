# Redesign Handoff Packet

This folder is a self-contained brief for implementing the **"Reading Room" redesign** of Lollipop Dragon. It is written for an AI coding agent (or any engineer) picking up the work with no prior context.

## Read in this order

| Doc                                                    | What it gives you                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [00-brief.md](00-brief.md)                             | Mission, scope, ground truth, working agreements                                                                |
| [01-design-system.md](01-design-system.md)             | Tokens, typography, color, elevation, motion                                                                    |
| [02-screens.md](02-screens.md)                         | Every surface: layout, states, behavior                                                                         |
| [03-commenting-spec.md](03-commenting-spec.md)         | **The core spec**: character-range anchoring, overlapping comments, CriticMarkup serialization, orphan handling |
| [04-keyboard-a11y.md](04-keyboard-a11y.md)             | Keyboard matrix, focus rules, accessibility budget                                                              |
| [05-implementation-plan.md](05-implementation-plan.md) | Phased plan mapped to this repo's files, acceptance criteria, test requirements                                 |

## Ground truth

- **`reference-prototype/`** — a working HTML/CSS/JS prototype of the entire design. Open `index.html` in a browser. When prose in these docs is ambiguous, **the prototype's behavior is the spec** (exceptions listed in 00-brief). Its `app.js` contains the reference implementation of the overlap-rendering algorithm (`applyHighlights`) and range capture (`offsetIn` + the `mouseup` handler).
- **`assets/tokens.css`** — the design-token layer (both themes, comment taxonomy colors, core component styles). Port it, don't reinvent it.
- **`references/`** — the competitor and design-guideline research behind the decisions.

## Also exists (outside the repo)

- Stakeholder deck: `~/Desktop/lollipop-dragon-design-proposal.pptx`
- High-res screen renders: `~/Desktop/lollipop-dragon-design-assets/screens/`
