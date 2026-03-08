# MarkReview v1 — Technical Design

## 1. Version Scope

v1 is the first usable version of MarkReview: a client-side React app that opens a single local markdown file, renders it beautifully, parses CriticMarkup into visual comments, and lets the user add new comments that write CriticMarkup back into the file. No server, no accounts, no build step for the end user.

### What's in v1

- **Single file access** via File System Access API (`showOpenFilePicker`)
- **Rich markdown rendering**: CommonMark + GFM tables, task lists, footnotes, syntax-highlighted code blocks, Mermaid diagrams, admonitions
- **CriticMarkup parsing**: annotations are stripped from the rendered view and displayed as margin indicators + comment cards
- **Add comments**: hover on any block → click comment icon → pick type → write comment → CriticMarkup is inserted into the raw file and saved
- **Comment sidebar**: all comments listed in document order, filterable by type
- **Clean reading-first design**: light/dark mode, focus mode, comfortable typography

### What's NOT in v1

- Folder navigation / file tree sidebar (single file only)
- Editing or deleting comments (read + add only)
- File watching / live reload (user manually refreshes)
- Dev server / CLI (`npx markreview`)
- Version diffing
- LLM API integration
- Search within comments
- Keyboard shortcuts beyond browser defaults
- Config file support (`.markreview/config.json`)

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | React 19 + Vite | Fast dev cycle, huge ecosystem |
| Markdown parsing | `react-markdown` + `remark-gfm` | Industry standard, plugin-based, safe rendering |
| Diagrams | `mermaid` (direct) | Official library, render to SVG in a custom component |
| Syntax highlighting | `rehype-shiki` (`@shikijs/rehype`) | Modern, accurate, async, 180+ languages |
| File access | File System Access API | Native browser API, no server needed |
| Styling | Tailwind CSS | Utility-first, fast to iterate on design |
| State management | Zustand | Lightweight, no boilerplate, good for mid-size apps |
| CriticMarkup parsing | Custom parser (see §5) | No maintained library exists; syntax is simple enough to parse with regex + state machine |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   Browser Tab                    │
├─────────────────────────────┬───────────────────┤
│       Document Viewer       │   Comment Panel    │
│                             │  (Right sidebar)   │
│  ┌───────────────────────┐  │                   │
│  │ Rendered Markdown      │  │ [fix] line 42    │
│  │ (no CriticMarkup)     │  │ [expand] ln 87   │
│  │                       │  │ [question] ...    │
│  │ ● ● (left margins)    │  │                   │
│  │                       │  │ Filter: [all]     │
│  └───────────────────────┘  │                   │
├─────────────────────────────┴───────────────────┤
│              Zustand Store                       │
│  fileHandle | rawMarkdown | comments | uiState  │
├─────────────────────────────────────────────────┤
│         File System Access API Layer             │
│  openFile() | readFile() | writeFile()          │
└─────────────────────────────────────────────────┘
```

### Key data flow

1. User picks a `.md` file → `showOpenFilePicker()` → read raw markdown → CriticMarkup parser extracts comments + produces clean markdown
2. Clean markdown → `react-markdown` pipeline → rendered view with block IDs
3. Comments → margin indicators (mapped to block IDs) + comment panel list
4. User adds comment → CriticMarkup inserted at correct position in raw markdown → file written back via File System Access API → re-parse and re-render

---

## 4. Component Structure

```
App
├── FilePicker            — "Open File" landing screen + file name header bar
├── Layout                — Two-panel layout container
│   ├── DocumentViewer
│   │   ├── MarkdownRenderer  — react-markdown with plugins
│   │   │   ├── MermaidBlock  — Custom component for mermaid code blocks
│   │   │   └── CodeBlock     — Shiki-highlighted code
│   │   ├── CommentMargin     — Left margin with comment dots
│   │   └── AddCommentPopover — Type selector + text input
│   └── CommentPanel
│       ├── CommentCard       — Single comment display
│       └── CommentFilter     — Filter by type dropdown
└── ThemeProvider             — Light/dark mode
```

---

## 5. CriticMarkup Parser

### 5.1 Strategy

No maintained JS library exists for CriticMarkup, so we build a custom parser. The syntax is simple enough that a regex-based approach works for v1, with a state-machine upgrade path if edge cases demand it.

### 5.2 Input/Output

**Input:** Raw markdown string containing CriticMarkup annotations.

**Output:**
- `cleanMarkdown`: The markdown with all CriticMarkup removed (for rendering)
- `comments[]`: Array of extracted comment objects with position info

```typescript
interface Comment {
  id: string;                  // Generated unique ID
  type: CommentType;           // 'fix' | 'rewrite' | 'expand' | 'clarify' | 'question' | 'remove' | 'note'
  text: string;                // The comment body (after type prefix)
  highlightedText?: string;    // The text between {== ==} if present
  rawMarkup: string;           // Original CriticMarkup string (for reinsertion)
  position: {
    startOffset: number;       // Character offset in raw markdown
    endOffset: number;
    blockIndex: number;        // Which rendered block this maps to
  };
  syntax: 'highlight_comment'  // {==text==}{>>comment<<}
        | 'standalone_comment' // {>>comment<<}
        | 'addition'           // {++text++}
        | 'deletion'           // {--text--}
        | 'substitution';      // {~~old~>new~~}
}

type CommentType = 'fix' | 'rewrite' | 'expand' | 'clarify' | 'question' | 'remove' | 'note';
```

### 5.3 Parsing approach

```typescript
const CRITIC_PATTERNS = {
  highlight_comment: /\{==(.+?)==\}\{>>(.+?)<<\}/gs,
  standalone_comment: /\{>>(.+?)<<\}/gs,
  addition: /\{\+\+(.+?)\+\+\}/gs,
  deletion: /\{--(.+?)--\}/gs,
  substitution: /\{~~(.+?)~>(.+?)~~\}/gs,
};
```

Parse in two passes:
1. **Extract pass**: Find all CriticMarkup spans, record their positions and content, assign to nearest block
2. **Clean pass**: Remove all CriticMarkup from the markdown string to produce clean render input

### 5.4 Block mapping

After react-markdown renders, each top-level block (paragraph, heading, table, code block, list) gets a `data-block-index` attribute. The parser maps each comment to a block index based on which block's character range contains the comment's offset. This is how margin dots know where to appear.

---

## 6. File System Layer

### 6.1 API surface

```typescript
// fileSystem.ts
interface FileSystemService {
  openFile(): Promise<{ handle: FileSystemFileHandle; name: string }>;
  readFile(handle: FileSystemFileHandle): Promise<string>;
  writeFile(handle: FileSystemFileHandle, content: string): Promise<void>;
}
```

### 6.2 File picker

- Use `showOpenFilePicker()` with `accept` filter for `.md` / `.markdown` files
- Request `readwrite` permission on the handle so we can write comments back
- Store the file handle in memory (lost on tab close — acceptable for v1)
- If write permission is denied, fall back to read-only mode and disable "Add Comment"
- Display the file name in a top header bar with an "Open another file" button

---

## 7. Comment Insertion Logic

When the user adds a comment on a block:

1. Identify the block's position in the **raw** markdown (not the clean version)
2. Determine insertion point:
   - For a standalone comment on a block → insert `{>>type: comment text<<}` at the end of the block's last line
   - For a highlight comment (future: text selection) → wrap selected text with `{==selected==}{>>type: comment<<}`
3. Write the modified raw markdown back to the file via `FileSystemWritableFileStream`
4. Re-parse and re-render

### Insertion example

**Before:**
```markdown
PostgreSQL is the best choice for this project.
```

**After user adds a "fix" comment:**
```markdown
PostgreSQL is the best choice for this project.{>>fix: This claim needs evidence. Compare PostgreSQL, MySQL, and SQLite.<<}
```

---

## 8. Zustand Store Shape

```typescript
interface AppStore {
  // File system
  fileHandle: FileSystemFileHandle | null;
  fileName: string | null;

  // Active document
  rawMarkdown: string;
  cleanMarkdown: string;
  comments: Comment[];

  // UI state
  commentPanelOpen: boolean;
  commentFilter: CommentType | 'all';
  theme: 'light' | 'dark';
  focusMode: boolean;

  // Actions
  openFile: () => Promise<void>;
  addComment: (blockIndex: number, type: CommentType, text: string) => Promise<void>;
  refreshFile: () => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleFocusMode: () => void;
}
```

---

## 9. Rendering Pipeline

```
Raw Markdown
    │
    ▼
CriticMarkup Parser ──→ comments[]
    │
    ▼
Clean Markdown
    │
    ▼
react-markdown
    ├── remark-gfm        (tables, task lists, strikethrough, footnotes)
    └── rehype-shiki       (code syntax highlighting)
    │
    ▼
Custom component overrides:
    ├── code block → CodeBlock (shiki) or MermaidBlock (if lang=mermaid)
    ├── p, h1-h6, table, ul, ol, blockquote → wrapped with data-block-index
    └── all blocks → CommentMargin dot injection
    │
    ▼
Rendered Document with margin indicators
```

---

## 10. Design Tokens

```
Typography:
  body:         16px / 1.7 line-height, system font stack
  h1:           2rem, 700 weight
  h2:           1.5rem, 600 weight
  h3:           1.25rem, 600 weight
  code:         14px, JetBrains Mono / Fira Code
  max-width:    720px content column (centered)

Colors (light):
  background:   #FAFAF9 (warm off-white)
  surface:      #FFFFFF
  text:         #1C1917
  text-muted:   #78716C
  border:       #E7E5E4
  accent:       #2563EB (blue-600)

Comment type colors:
  fix:          #EF4444 (red)
  rewrite:      #F59E0B (amber)
  expand:       #3B82F6 (blue)
  clarify:      #8B5CF6 (violet)
  question:     #06B6D4 (cyan)
  remove:       #6B7280 (gray)

Spacing:
  comment panel: 320px width
  content gap:  24px from margins
  block gap:    16px between blocks
```

---

## 11. Known Limitations & Risks

| Risk | Mitigation |
|---|---|
| File System Access API is Chrome/Edge only | Clearly state browser requirement; Phase 2 adds server mode |
| Large files (10k+ lines) may slow react-markdown | Virtualize rendering if needed; defer mermaid for off-screen blocks |
| CriticMarkup regex parser may miss edge cases | Start with common patterns; add test suite with real-world examples |
| Block index mapping can break if markdown structure is ambiguous | Use conservative mapping; log warnings for unmapped comments |
| Permission prompts on every session | Inform user; explore `navigator.storage.getDirectory()` for persistence |
| No undo for comment insertion | Rely on git / manual editing for now; add undo in v2 |

---

## 12. Testing Strategy

### 12.1 Tools

| Tool | Purpose |
|---|---|
| Vitest | Unit and integration tests (Vite-native, fast) |
| React Testing Library | Component rendering and interaction tests |
| Playwright | E2E browser tests (needs real File System Access API) |

### 12.2 Unit Tests

**CriticMarkup parser** — the highest-risk custom code, needs the most coverage:
- Extraction: each syntax type (highlight+comment, standalone, addition, deletion, substitution) parsed correctly
- Type prefix parsing: `fix:`, `rewrite:`, `expand:`, etc. extracted and categorized
- Clean output: all CriticMarkup removed, surrounding markdown intact
- Position tracking: character offsets and block index mapping are accurate
- Round-trip: parse → insert new comment → re-parse produces expected state
- Edge cases: nested markup, CriticMarkup inside code blocks (should be ignored), empty comments, multiline comments, adjacent comments on same block, malformed/incomplete syntax

**Comment insertion logic:**
- Standalone comment appended to correct block position
- Type prefix formatted correctly
- Insertion doesn't corrupt surrounding markdown or existing CriticMarkup
- Insertion at document start, end, and between blocks

**File system service:**
- Read returns correct string content
- Write persists content (mocked `FileSystemFileHandle` in unit tests)
- Graceful handling of permission denied, file not found, file locked

### 12.3 Component Tests

- **MarkdownRenderer**: renders GFM tables, code blocks, task lists, mermaid; blocks have `data-block-index` attributes
- **CommentMargin**: correct number of dots per block, color matches comment type, click expands card
- **CommentPanel**: lists all comments in document order, filters work by type, shows correct count
- **AddCommentPopover**: opens on hover icon click, type selector works, submit inserts comment
- **FilePicker**: picker opens, file name displayed in header, "open another" resets state

### 12.4 Integration Tests

- **Full comment flow**: open file with existing CriticMarkup → verify comments displayed → add new comment → verify CriticMarkup written to file content → re-parse → verify new comment appears in UI
- **Mixed content**: file with tables + mermaid + code + CriticMarkup → everything renders, comments map to correct blocks
- **Read-only fallback**: simulate write permission denied → verify "Add Comment" is disabled

### 12.5 E2E Tests (Playwright)

- Open app → click "Open File" → select `.md` file → document renders
- Navigate to block → hover → click comment icon → fill form → submit → comment appears in panel
- Toggle dark mode → verify theme applied
- Toggle focus mode → verify comment UI hidden
- Refresh page → reopen same file → comments still present in file

### 12.6 Manual Test Matrix

A checklist of markdown features to visually verify before each release:

| Feature | Renders correctly | With CriticMarkup nearby |
|---|---|---|
| Paragraphs | ☐ | ☐ |
| Headings (h1–h6) | ☐ | ☐ |
| GFM tables | ☐ | ☐ |
| Fenced code blocks | ☐ | ☐ |
| Mermaid diagrams | ☐ | ☐ |
| Task lists | ☐ | ☐ |
| Footnotes | ☐ | ☐ |
| Nested lists | ☐ | ☐ |
| Blockquotes | ☐ | ☐ |
| Images | ☐ | ☐ |
| Horizontal rules | ☐ | ☐ |

---

## 13. Dev Milestones

Suggested build order to get to a working v1:

1. **Scaffold** — Vite + React + Tailwind + Zustand, two-panel layout with top bar, Vitest configured
2. **File picker** — Single file picker (`showOpenFilePicker`), read file, display file name in header
3. **Markdown rendering** — react-markdown pipeline with all plugins (GFM, mermaid, code highlighting)
4. **CriticMarkup parser + tests** — Extract comments, produce clean markdown, map to blocks; full unit test suite
5. **Comment display** — Margin dots, comment cards, comment panel with filtering
6. **Add comment + tests** — Hover UI, type selector, text input, CriticMarkup insertion, file write-back; integration tests for the full flow
7. **Design polish** — Typography, colors, light/dark mode, focus mode, transitions
8. **E2E & manual testing** — Playwright suite, manual test matrix pass, edge case sweep
