# MarkReview — Iteration Roadmap

Each iteration is a shippable version. Each step within an iteration is a deliverable — something you can demo, test, or merge independently.

---

## Iteration 1 — Markdown Viewer

**Goal:** Open a markdown file in the browser and render it beautifully. No commenting yet — just a great reading experience.

### Steps

**1.1 — Project scaffold**
- Vite + React 19 + TypeScript + Tailwind CSS + Zustand
- Vitest configured with a passing placeholder test
- Dev server runs, blank page loads
- **Deliverable:** `npm run dev` serves an empty app; `npm test` passes

**1.2 — File picker and raw display**
- "Open File" landing screen with a single button
- `showOpenFilePicker()` opens OS file dialog filtered to `.md` / `.markdown`
- Selected file's raw text displayed in a `<pre>` block
- File name shown in a top header bar with "Open another file" button
- **Deliverable:** User can pick a file and see its raw content in the browser

**1.3 — Basic markdown rendering**
- Replace `<pre>` with `react-markdown` + `remark-gfm`
- CommonMark rendering: headings, paragraphs, links, images, bold/italic
- GFM extras: tables, task lists, strikethrough, footnotes
- **Deliverable:** Markdown file renders as formatted HTML with GFM support

**1.4 — Code syntax highlighting**
- Integrate `@shikijs/rehype` into the react-markdown pipeline
- Fenced code blocks render with syntax highlighting (180+ languages)
- Code block styling: background, padding, font (JetBrains Mono / Fira Code)
- **Deliverable:** Code blocks in markdown render with proper syntax colors

**1.5 — Mermaid diagrams**
- Custom `MermaidBlock` component: detects `language=mermaid` code blocks
- Renders diagram to SVG using the `mermaid` library
- Error state: if diagram syntax is invalid, show the raw code with an error message
- **Deliverable:** Mermaid code blocks render as visual diagrams

**1.6 — Typography and reading design**
- Apply design tokens: 16px body, 1.7 line-height, 720px max-width centered column
- Heading hierarchy, paragraph spacing, blockquote styling
- Warm off-white background, clean surface colors
- Responsive layout for desktop and tablet widths
- **Deliverable:** A markdown file reads like a well-typeset article

**1.7 — Dark mode and focus mode**
- Theme toggle (light/dark) in the header bar
- Dark mode color palette applied via Tailwind dark: classes
- Focus mode toggle: hides header bar, maximizes content area
- Theme preference stored in Zustand (resets on tab close for v1)
- **Deliverable:** User can switch between light/dark mode and enter distraction-free reading

**1.8 — Iteration 1 testing**
- Unit tests: file system service (mocked handles), theme toggle logic
- Component tests: MarkdownRenderer renders all supported elements with correct structure
- Manual test matrix pass: paragraphs, headings, tables, code, mermaid, task lists, footnotes, nested lists, blockquotes, images, horizontal rules
- Test with 3–5 real-world LLM-generated markdown files of varying complexity
- **Deliverable:** Test suite passes; manual checklist signed off

---

## Iteration 2 — CriticMarkup Display

**Goal:** Parse CriticMarkup from the file and display comments visually. Read-only — no adding comments yet.

### Steps

**2.1 — CriticMarkup parser: extraction**
- Custom parser module with regex patterns for all five syntax types: highlight+comment, standalone comment, addition, deletion, substitution
- Input: raw markdown string → Output: array of `Comment` objects with type, text, highlighted text, raw markup, character offsets
- **Deliverable:** Parser function extracts comments from a markdown string; unit tests cover all syntax types

**2.2 — CriticMarkup parser: clean output**
- Second parser output: `cleanMarkdown` with all CriticMarkup stripped
- Surrounding markdown stays intact (no extra whitespace, no broken structure)
- CriticMarkup inside fenced code blocks is left untouched (not treated as comments)
- **Deliverable:** Parser produces clean markdown; unit tests verify no corruption of surrounding content

**2.3 — CriticMarkup parser: type prefix parsing**
- Parse Conventional Comments prefixes from comment text: `fix:`, `rewrite:`, `expand:`, `clarify:`, `question:`, `remove:`
- Comments without a recognized prefix default to `note` type
- **Deliverable:** Each extracted comment has a `type` field; unit tests for all prefix variations

**2.4 — Block index mapping**
- Wrap each top-level rendered block (paragraph, heading, table, code block, list, blockquote) with `data-block-index` attribute
- Map each comment's character offset to the block that contains it
- **Deliverable:** Comments are mapped to block indices; unit tests verify correct mapping for mixed-content documents

**2.5 — Comment margin indicators**
- Left margin column alongside the document viewer
- Colored dots per block, color-coded by comment type (red=fix, amber=rewrite, blue=expand, violet=clarify, cyan=question, gray=remove)
- Multiple dots if a block has multiple comments
- **Deliverable:** Dots appear in the margin next to blocks that have CriticMarkup comments

**2.6 — Comment cards**
- Clicking a margin dot opens an inline comment card below the dot
- Card shows: type badge, comment text, highlighted text (if present)
- Click again or click elsewhere to collapse
- **Deliverable:** User can click margin dots to read individual comments

**2.7 — Comment panel (right sidebar)**
- Right sidebar listing all comments in document order
- Each entry shows: type badge, truncated text, block reference
- Click an entry to scroll the document to that block and highlight the margin dot
- Collapsible sidebar toggle
- **Deliverable:** All comments visible in a scrollable list; clicking navigates to the comment in the document

**2.8 — Comment filtering**
- Filter dropdown in the comment panel: All / fix / rewrite / expand / clarify / question / remove
- Filter updates both the panel list and the margin dots (hide non-matching)
- Show count per filter option
- **Deliverable:** User can filter comments by type in the panel and margin

**2.9 — Iteration 2 testing**
- Parser edge case suite: nested markup, multiline comments, adjacent comments, empty comments, malformed syntax, CriticMarkup in code blocks
- Component tests: CommentMargin, CommentCard, CommentPanel, CommentFilter
- Integration test: load file with mixed CriticMarkup → verify all comments displayed in correct positions
- Manual test: open 3 real markdown files with CriticMarkup → verify rendering matches expectations
- **Deliverable:** Test suite passes; parser handles all edge cases gracefully

---

## Iteration 3 — Add Comments

**Goal:** User can add new CriticMarkup comments through the UI that write back to the file.

### Steps

**3.1 — Block hover UI**
- On hover over any rendered block, show a subtle comment icon in the left margin
- Icon appears with a fade-in animation, disappears on mouse leave
- Icon positioned vertically centered relative to the block
- **Deliverable:** Hovering over any block reveals a clickable comment icon

**3.2 — Add comment popover**
- Clicking the comment icon opens a popover with: type selector dropdown (fix, rewrite, expand, clarify, question, remove), text input area, Submit and Cancel buttons
- Popover anchored near the clicked block
- Focus lands in the text input on open
- **Deliverable:** User sees a comment form when clicking the margin icon

**3.3 — Comment insertion logic**
- On submit: construct CriticMarkup string `{>>type: comment text<<}`
- Find the block's position in the raw markdown (not the clean version)
- Insert CriticMarkup at the end of the block's last line in raw markdown
- **Deliverable:** Function that takes raw markdown + block index + comment → returns modified markdown; unit tests for insertion at various positions

**3.4 — File write-back**
- Write the modified raw markdown back to disk via `FileSystemWritableFileStream`
- Re-parse and re-render after write
- New comment appears in margin and panel immediately
- Handle write errors gracefully (show toast/notification)
- **Deliverable:** Adding a comment persists to the actual file on disk; re-opening the file shows the comment

**3.5 — Read-only fallback**
- If write permission was denied during file open, disable the comment icon hover
- Show a subtle banner: "Read-only mode — commenting disabled"
- All display features still work
- **Deliverable:** App degrades gracefully when write access is unavailable

**3.6 — Iteration 3 testing**
- Unit tests: comment insertion at document start, middle, end, between existing comments
- Unit tests: insertion doesn't corrupt surrounding CriticMarkup or markdown structure
- Integration test: open file → add comment → close and reopen file → comment persists
- Integration test: round-trip — add comment → verify raw file content → re-parse → verify comment appears
- E2E test (Playwright): full flow from open file through comment submission
- **Deliverable:** Test suite passes; commenting works reliably across edge cases

---

## Iteration 4 — Comment Management

**Goal:** Edit, delete, and track resolution of comments.

### Steps

**4.1 — Edit comments**
- "Edit" button on comment cards
- Opens the same popover pre-filled with existing type and text
- On submit: locate original CriticMarkup in raw markdown, replace with updated version
- Re-parse and re-render
- **Deliverable:** User can modify an existing comment's type and text

**4.2 — Delete comments**
- "Delete" button on comment cards with a confirmation prompt
- Remove the CriticMarkup from the raw markdown
- Write back to file, re-parse, re-render
- **Deliverable:** User can remove a comment, and the CriticMarkup is gone from the file

**4.3 — Resolve detection**
- On file refresh (manual "Refresh" button in header), compare new raw markdown against previous
- Comments whose CriticMarkup no longer exists in the file are marked as "resolved"
- Resolved comments shown with a strikethrough/dimmed style in the panel
- **Deliverable:** After an LLM removes CriticMarkup, the user sees those comments as resolved on refresh

**4.4 — Comment panel filter: pending / resolved**
- Add "Pending" and "Resolved" filter options alongside type filters
- Pending = CriticMarkup still in file; Resolved = removed since last session
- **Deliverable:** User can filter to see only unaddressed comments

**4.5 — Single-level undo**
- After add, edit, or delete: show an "Undo" toast for 5 seconds
- Undo reverts the raw markdown to pre-action state and rewrites file
- Only the last action is undoable
- **Deliverable:** User can undo their last comment action

**4.6 — Iteration 4 testing**
- Unit tests: edit and delete CriticMarkup manipulation (correctness, no side effects on adjacent comments)
- Unit tests: resolve detection logic (diff-based)
- Integration test: add comment → simulate LLM removing it → refresh → verify resolved
- Integration test: edit comment → verify file content → delete → verify removal
- Integration test: undo after each action type
- **Deliverable:** Test suite passes; full comment lifecycle verified

---

## Iteration 5 — Folder Navigation

**Goal:** Open a folder, browse files, navigate between them.

### Steps

**5.1 — Folder picker**
- Add "Open Folder" as an alternative entry point alongside "Open File"
- `showDirectoryPicker()` with `readwrite` mode
- Recursive directory traversal to build file tree structure
- **Deliverable:** User can select a folder; app reads its structure

**5.2 — File tree sidebar**
- Left sidebar with collapsible folder/file tree
- Filter: show only `.md` / `.markdown` files
- Ignore: `node_modules`, `.git`, `.markreview`, dotfiles
- Directories first, then alphabetical
- **Deliverable:** Sidebar shows the folder structure with markdown files

**5.3 — File navigation**
- Click a file in the tree → load and render it in the document viewer
- Currently open file highlighted in the tree
- Unsaved state warning if applicable (not needed yet since writes are immediate)
- **Deliverable:** User can switch between files by clicking the tree

**5.4 — Comment count badges**
- Each file in the tree shows a badge with the count of pending CriticMarkup comments
- Counts computed on folder open (scan all files) and updated when a file is modified
- Files with zero comments show no badge
- **Deliverable:** User can see at a glance which files need review

**5.5 — Collapsible sidebar**
- Toggle button to hide/show the file tree sidebar
- When hidden, document viewer expands to fill the space
- Keyboard shortcut for toggle (Cmd+B / Ctrl+B)
- **Deliverable:** User can maximize reading space by hiding the sidebar

**5.6 — Iteration 5 testing**
- Unit tests: directory traversal, file filtering, ignore patterns
- Unit tests: comment count scanning
- Component tests: FileTreeSidebar, FileTreeNode, FileBadge
- Integration test: open folder → navigate between files → verify comment counts
- Edge cases: deeply nested folders, empty directories, mixed file types, 200+ files
- **Deliverable:** Test suite passes; folder navigation works across project structures

---

## Iteration 6 — Dev Server & Live Reload

**Goal:** CLI tool that serves MarkReview locally with live reload. Works in any browser.

### Steps

**6.1 — Node.js server scaffold**
- Express or Fastify server serving the built React app as static files
- `npx markreview ./folder` or `npx markreview ./file.md` CLI entry point
- Opens default browser on startup
- **Deliverable:** `npx markreview ./folder` starts a local server and opens the UI in the browser

**6.2 — REST API: file operations**
- `GET /api/files` — list file tree (markdown files only)
- `GET /api/files/:path` — read file content
- `PUT /api/files/:path` — write file content
- React app uses REST API instead of File System Access API when running in server mode
- **Deliverable:** API endpoints work; app functions the same via REST as via browser API

**6.3 — File watcher + WebSocket**
- Chokidar file watcher on the served folder
- WebSocket connection from browser to server
- On file change: server pushes notification → browser re-reads the changed file → re-parse and re-render
- Debounce: 200ms to batch rapid changes
- **Deliverable:** Edit a file on disk → UI updates within 300ms without manual refresh

**6.4 — Cross-browser support**
- Feature detection: use File System Access API if available, REST API otherwise
- Manual testing: Firefox, Safari, Chrome, Edge all work via dev server
- **Deliverable:** App works in all modern browsers when using the dev server

**6.5 — CLI polish**
- `--port` flag (default 3000)
- `--no-open` flag to skip browser launch
- Pretty terminal output: server URL, watched folder, file count
- Graceful shutdown on Ctrl+C
- **Deliverable:** CLI is production-ready with useful flags and output

**6.6 — Iteration 6 testing**
- Unit tests: file watcher (debouncing, ignore patterns, nested changes)
- Unit tests: REST API endpoints (status codes, error handling)
- WebSocket integration test: file change → browser notification → correct file re-rendered
- CLI test: start with various flags, verify behavior
- Cross-browser manual test pass
- **Deliverable:** Test suite passes; live reload verified across browsers

---

## Iteration 7 — Version Diffing

**Goal:** Show what the LLM changed between revisions.

### Steps

**7.1 — Version snapshot**
- On each file change (detected via watcher or manual refresh): store the previous raw markdown in memory
- Keep last 10 versions per file in a ring buffer
- **Deliverable:** Previous versions are retained in memory for comparison

**7.2 — Diff computation**
- Use a text diff library (e.g., `diff` npm package) to compute line-level changes
- Output: list of added, removed, and unchanged line ranges
- **Deliverable:** Diff function returns structured change data; unit tests for various change types

**7.3 — Inline diff view**
- Toggle "Show changes" button in the header
- Additions highlighted with green background, deletions with red
- Unchanged text displayed normally
- **Deliverable:** User can see what changed between current and previous version

**7.4 — Comment-aware diffing**
- Cross-reference diff with comment positions
- Show which comments were addressed (their CriticMarkup was removed) in this revision
- Badge in comment panel: "Addressed in latest change"
- **Deliverable:** User can see which feedback the LLM acted on

**7.5 — Revision selector**
- Dropdown to compare current version against any of the last 10 snapshots
- Display timestamp and change summary (lines added/removed) per snapshot
- **Deliverable:** User can compare against any recent version, not just the previous one

**7.6 — Iteration 7 testing**
- Unit tests: diff algorithm correctness (insertions, deletions, mixed, whitespace-only)
- Unit tests: comment-aware diff matching
- Component tests: diff highlighting renders correctly
- Integration test: file with comments → LLM modifies → diff shows addressed comments
- Performance test: diff on 10k-line file in < 500ms
- **Deliverable:** Test suite passes; diffing verified on real revision scenarios

---

## Iteration 8 — Search & Keyboard Navigation

**Goal:** Find content fast across files and comments. Navigate without a mouse.

### Steps

**8.1 — Search within comments**
- Search input at the top of the comment panel
- Filters comments by text content (fuzzy match)
- Results highlight matched text
- **Deliverable:** User can find specific comments by searching

**8.2 — Full-text search across files**
- `Cmd+Shift+F` / `Ctrl+Shift+F` opens a search overlay
- Searches all markdown files in the folder (server mode) or current file (single-file mode)
- Results grouped by file, showing matched line with context
- Click result → navigates to file and scrolls to match
- **Deliverable:** User can find text across the entire project

**8.3 — Keyboard shortcuts**
- `j` / `k` — next / previous comment
- `Cmd+B` / `Ctrl+B` — toggle file sidebar
- `Cmd+\` / `Ctrl+\` — toggle comment panel
- `Cmd+Shift+F` / `Ctrl+Shift+F` — search
- `Esc` — close any open popover/panel
- Shortcut help panel (press `?`)
- **Deliverable:** Power users can navigate the entire app via keyboard

**8.4 — Command palette**
- `Cmd+K` / `Ctrl+K` opens a command palette
- Actions: open file, toggle theme, toggle focus mode, jump to comment by type, filter comments
- Fuzzy search over command names
- **Deliverable:** Quick access to any action via the command palette

**8.5 — Iteration 8 testing**
- Unit tests: search indexing, query matching, fuzzy matching
- Unit tests: keyboard shortcut registration, no conflicts with browser defaults
- Integration test: search → click result → correct file and position
- Performance test: search across 500 files returns in < 200ms
- Accessibility audit: all interactive elements reachable via keyboard
- **Deliverable:** Test suite passes; keyboard-driven workflow verified

---

## Iteration 9 — Configuration & Polish

**Goal:** User preferences, production error handling, performance for large files.

### Steps

**9.1 — Config file support**
- Read `.markreview/config.json` from the opened folder (if present)
- Supported settings: theme (light/dark), default comment type, font size, ignored paths
- Fallback to sensible defaults when no config exists
- **Deliverable:** App respects user configuration from file

**9.2 — Custom comment types**
- Config allows defining additional comment types beyond the built-in six
- Custom types have a name, color, and description
- Appear in the type selector and filter dropdown
- **Deliverable:** Teams can define project-specific comment categories

**9.3 — Error handling & recovery**
- Permission denied: clear messaging and read-only fallback
- Corrupt/invalid markdown: render what's possible, show warning for broken sections
- Malformed CriticMarkup: skip and warn, don't crash
- File deleted while open: notification with option to close
- **Deliverable:** App handles every error state gracefully without crashing

**9.4 — Performance: large file optimization**
- Virtualized rendering for files over 3,000 lines (only render visible blocks)
- Lazy Mermaid: render diagrams only when scrolled into view
- Profile and optimize CriticMarkup parser for 10k-line files
- **Deliverable:** 10k-line file renders in < 1s; Mermaid diagrams render within 500ms

**9.5 — Export clean view**
- "Print" button that opens browser print dialog with a clean stylesheet (no UI chrome, no comment indicators)
- CSS print media query for proper page breaks
- **Deliverable:** User can print or save-to-PDF a clean rendered document

**9.6 — Onboarding**
- First-launch welcome screen explaining the workflow (open file → read → comment → hand to LLM)
- Sample markdown file with CriticMarkup examples bundled in the app
- "Don't show again" checkbox
- **Deliverable:** New users understand the tool's purpose within 30 seconds

**9.7 — Iteration 9 testing**
- Unit tests: config loading, validation, default merging
- E2E tests: full user journey (onboarding → open file → comment → refresh → resolved)
- Performance benchmarks: 10k-line file, 500ms mermaid, search across 500 files
- Accessibility audit: WCAG 2.1 AA compliance
- Cross-platform manual testing: macOS, Windows, Linux
- **Deliverable:** All tests pass; production readiness verified

---

## Future Iterations (Backlog)

- **Direct LLM API integration** — send file + comments to an LLM from within the editor
- **Project dashboard** — overview of all files, pending comment counts, review progress
- **Comment history** — track comments across revisions over time
- **Collaborative review** — multiple reviewers on the same file (conflict resolution)
- **Plugin system** — custom renderers, comment types, export formats
- **VS Code extension** — same UI as a webview panel inside the editor
- **npm package publishing** — `npm install -g markreview` for global CLI access
