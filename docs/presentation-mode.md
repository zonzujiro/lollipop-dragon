# Presentation Mode

## Overview

Presentation mode transforms a markdown document into a slideshow. Each top-level section of the document becomes a slide. The user navigates between slides using keyboard arrows, with smooth transition animations. All chrome (header, tab bar, sidebar, comment panel) is hidden — only the slide content, navigation dots, and a theme toggle are visible.

## How slides are defined

The rendered markdown is split into **slides** by top-level headings (`# Heading` / `<h1>`) or horizontal rules (`---` / `<hr>`). Everything before the first heading or rule is slide 0. Each subsequent heading/rule starts a new slide.

Example source:

```markdown
# Introduction
Some intro text.

# Architecture
Diagrams and explanation.

# Roadmap
Future plans.
```

This produces 3 slides: "Introduction", "Architecture", "Roadmap".

If the document uses `---` separators instead of headings, the same splitting logic applies.

## Entering presentation mode

- **Host mode**: A "Present" button (play/slideshow icon) is available in the `Header` actions area, next to the existing focus-mode button. It is visible only when a file is open (i.e., the tab has content). Clicking it enters presentation mode.
- **Peer mode**: Not available. Presentation mode is host-only.
- **Keyboard shortcut**: None initially (can be added later).

When entering presentation mode the app:
1. Sets `presentationMode: true` on the store.
2. Hides: Header, TabBar, FileTreeSidebar, CommentPanel, SharedPanel, read-only banner.
3. Parses the current rendered markdown into slides.
4. Shows slide 0 (the first slide).
5. Requests fullscreen via the Fullscreen API (`document.documentElement.requestFullscreen()`). If the browser denies the request, presentation mode still works in the normal window.

## Exiting presentation mode

- Press **Escape** — exits presentation mode (and fullscreen).
- Click the **X** button in the top-right corner (small, subtle, fades in on mouse movement).
- If the browser exits fullscreen externally (e.g., user presses F11), presentation mode also exits.

When exiting:
1. Sets `presentationMode: false`.
2. Restores all previously visible chrome.
3. Exits fullscreen if still active.

## Navigation

| Input | Action |
|---|---|
| Arrow Down / Arrow Right / Space / Page Down | Next slide |
| Arrow Up / Arrow Left / Backspace / Page Up | Previous slide |
| Home | First slide |
| End | Last slide |

Navigation wraps: pressing "next" on the last slide does nothing (no wrap-around). Same for "previous" on the first slide.

## UI layout in presentation mode

```
┌──────────────────────────────────────────────────────┐
│                                                  [X] │
│                                                      │
│                                                      │
│              ┌─────────────────────┐            ●    │
│              │                     │            ○    │
│              │    Slide content    │            ○    │
│              │   (centered, large  │            ○    │
│              │    font, max-width) │            ○    │
│              │                     │                 │
│              └─────────────────────┘                 │
│                                                      │
│                                                      │
│                                         [sun/moon]   │
└──────────────────────────────────────────────────────┘
```

### Slide content area
- Centered horizontally and vertically.
- Max-width ~800px to keep line lengths readable.
- Font size increased relative to normal view (e.g., base 1.4rem).
- The full markdown rendering pipeline is used (syntax highlighting, mermaid diagrams, GFM tables, etc.) — we reuse the existing `ReactMarkdown` setup from `MarkdownRenderer`.

### Dot navigation (right edge)
- A vertical column of dots, one per slide, positioned on the right side of the screen, vertically centered.
- The current slide's dot is filled/active (larger or different color).
- Clicking a dot navigates to that slide.
- If there are many slides (>15), dots become smaller to fit.

### Theme toggle (bottom-right corner)
- A small sun/moon icon button in the bottom-right corner.
- Toggles between light and dark theme (reuses the existing `setTheme` action).
- Fades in on mouse movement, fades out after inactivity (same as the X button).

### Exit button (top-right corner)
- A small X icon.
- Appears on mouse movement, fades out after ~2s of inactivity.

## Slide transitions

When navigating between slides, the outgoing slide fades/slides out and the incoming slide fades/slides in. The direction depends on navigation:

- **Next slide**: content slides up (outgoing goes up, incoming comes from below).
- **Previous slide**: content slides down (outgoing goes down, incoming comes from above).

Transition duration: ~300ms, CSS-only (no JS animation libraries). Uses CSS transitions or keyframe animations on a wrapper element.

## State

### New store fields (on `AppState` root — global, not tab-scoped)

| Field | Type | Default | Description |
|---|---|---|---|
| `presentationMode` | `boolean` | `false` | Whether presentation mode is active |

No other store state is needed. The current slide index and slide list are local component state within the `PresentationMode` component, since they are derived from the current document content and don't need to persist or be accessed by other components.

### Actions

| Action | Signature | Description |
|---|---|---|
| `enterPresentationMode` | `() => void` | Sets `presentationMode: true` |
| `exitPresentationMode` | `() => void` | Sets `presentationMode: false` |

## Component structure

### `PresentationMode` (new component)

`src/components/PresentationMode.tsx`

- Rendered in `App.tsx` when `presentationMode === true` (replaces the normal host-mode layout, similar to how `focusMode` works but more completely).
- Reads `rawContent` from the active tab via selectors.
- Splits rendered content into slides.
- Manages local state: `currentSlide`, `slideDirection` (for animation), `controlsVisible` (for fade-in/out of X and theme buttons).
- Renders:
  - Slide viewport with transition wrapper
  - Dot navigation
  - Theme toggle button
  - Exit button
  - Mouse-move listener to show/hide controls

### Slide splitting strategy

The component renders the full markdown to HTML (using the same `ReactMarkdown` + rehype pipeline), then splits the resulting DOM nodes at `<h1>` or `<hr>` boundaries. Each group of nodes between boundaries is one slide.

This is done by:
1. Rendering markdown through `ReactMarkdown` into a hidden container (or using a custom rehype plugin).
2. Walking the top-level children and grouping them by `<h1>`/`<hr>` boundaries.
3. Rendering only the current slide's group.

A simpler alternative: split the **raw markdown string** at `^# ` or `^---` lines before rendering, then render only the current slide's markdown chunk. This avoids DOM manipulation but may break cross-references. We'll use this simpler approach.

## User flows

### Flow 1: Enter and navigate a presentation

1. User opens a markdown file (or folder + selects a file).
2. User clicks the "Present" button in the header.
3. Screen goes fullscreen. All chrome disappears. First slide is shown centered with large text.
4. User presses Down arrow — slide 1 animates in from below, slide 0 exits upward.
5. User presses Up arrow — slide 0 animates in from above, slide 1 exits downward.
6. User clicks dot 3 — navigates to slide 3 with a directional slide animation (up or down based on relative position).
7. User presses Escape — exits presentation mode, returns to normal view.

### Flow 2: Toggle theme during presentation

1. User is in presentation mode, dark theme.
2. User moves mouse — theme toggle (sun icon) fades in at bottom-right.
3. User clicks sun icon — theme switches to light mode instantly.
4. After 2s of no mouse movement, the icon fades out again.

### Flow 3: Exit via close button

1. User is in presentation mode.
2. User moves mouse — X button fades in at top-right.
3. User clicks X — presentation mode exits, normal view restores.

## Files to create / modify

| File | Change |
|---|---|
| `src/components/PresentationMode.tsx` | New component |
| `src/store/index.ts` | Add `presentationMode`, `enterPresentationMode`, `exitPresentationMode` to `AppState` |
| `src/App.tsx` | Render `PresentationMode` when `presentationMode === true` |
| `src/components/Header.tsx` | Add "Present" button |
| `src/index.css` | Presentation mode styles |

## Edge cases

- **Empty document**: Renders as a single empty slide (no placeholder message).
- **Document with no headings or rules**: The entire document is one slide.
- **Very long slide**: Content scrolls vertically within the slide viewport if it exceeds the screen height.
- **Mermaid diagrams**: Should render normally within a slide — the existing `MermaidBlock` component handles this.
- **Code blocks**: Syntax highlighting works as usual via Shiki.
- **Focus mode active**: If focus mode is on when user enters presentation mode, it should work the same way. On exit, restore focus mode state as it was.
