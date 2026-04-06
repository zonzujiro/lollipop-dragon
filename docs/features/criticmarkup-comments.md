# MarkReview — LLM Research Review Platform

## 1. Product Overview

MarkReview is a browser-based platform for developers who use LLM CLIs (like Claude Code) to generate research documents in markdown. It provides a clean, reader-first interface for reviewing rich markdown content and a commenting system built on CriticMarkup — an open standard for editorial annotations. Since comments live directly in the markdown files, any LLM can read and act on them naturally. No export steps, no sidecar files, no sync issues.

---

## 2. Problem Statement

When an LLM produces lengthy research in markdown, the review cycle is clunky. You read raw markdown in a code editor, mentally track what needs fixing, then describe changes in a chat prompt. There's no tool that lets you annotate the actual file with structured feedback that the LLM can see and act on when it next reads the file.

---

## 3. Target User

Developers and technical professionals who use LLM CLIs to generate structured research, analysis, documentation, or reports in markdown, and who want a fluid review-and-iterate workflow.

---

## 4. Competitive Landscape

**Obsidian** — Excellent local-first reading experience and folder navigation, but no meaningful commenting system and no collaboration workflow. Best reference for how a folder-based markdown tool should feel.

**Notion** — Gold standard for block-level comment UX (hover, click, comment, resolve). But it's cloud-based, not markdown-native, and can't point at a local folder. No Mermaid support.

**Typora** — Beautiful minimal design where the UI disappears and you just see content. Supports Mermaid and LaTeX. No commenting at all. The design philosophy is exactly what we want for the reading experience.

**GitHub PR Reviews** — The resolve/unresolve pattern and line-level commenting are close to our workflow, but tied to git diffs rather than a reading-first experience. Functional design, not beautiful.

**HackMD / CodiMD** — Collaborative markdown with real-time editing and comments. Focused on multi-user, not LLM collaboration. Reading experience is decent but editor-first.

**CriticMarkup-compatible editors** (MultiMarkdown Composer, iA Writer) — Support the annotation syntax but none provide a full review workflow with rendered previews, comment panels, and folder navigation.

**Cursor / AI code editors** — Solve a similar human-reviews-AI-output problem for code. Inline diff and accept/reject patterns are relevant for our future version diffing feature.

**What nobody has:** No existing tool combines a beautiful reader-first markdown rendering (with diagrams, math, tables), block-level commenting via an open standard, folder navigation, and a workflow designed for LLM collaboration. That's the gap.

---

## 5. Core Workflow

**Step 1:** Developer opens a folder containing LLM-generated markdown files in MarkReview.

**Step 2:** Developer reads a document in a clean, rendered view with full support for diagrams, tables, code, and math. CriticMarkup syntax is hidden from the reading view and displayed as UI comment elements.

**Step 3:** Developer selects any block and leaves a comment. The editor writes CriticMarkup directly into the markdown file with a Conventional Comments-style type prefix.

**Step 4:** Developer tells the LLM CLI: "Read this file and address all CriticMarkup comments." The LLM sees the comments inline, makes the fixes, and removes the markup.

**Step 5:** Developer refreshes (Phase 1) or sees live updates (Phase 2) with the LLM's changes applied.

---

## 6. Comment Protocol — CriticMarkup + Conventional Comments

### 6.1 Base Standard

MarkReview uses CriticMarkup, an open plain-text annotation standard. The relevant syntax:

- Highlight + comment: `{==highlighted text==}{>>comment about it<<}`
- Standalone comment (not attached to specific text): `{>>comment<<}`
- Suggested addition: `{++added text++}`
- Suggested deletion: `{--removed text--}`
- Suggested substitution: `{~~old text~>new text~~}`

### 6.2 Type Prefixes

Inside comments, MarkReview uses Conventional Comments-style type prefixes to categorize feedback:

```
{==PostgreSQL is the best choice.==}{>>fix: This claim needs evidence. Compare PostgreSQL, MySQL, and SQLite.<<}

{>>expand: Add a summary table comparing all three databases.<<}

{==def connect_db():
    return psycopg2.connect(host="localhost")==}{>>fix: Add error handling and connection pooling.<<}

{>>question: Why was Redis excluded from this analysis?<<}

{--This paragraph is redundant and repeats the introduction.--}

{~~synchronous API~>asynchronous API~~}
```

Supported types:

- **fix** — something is wrong, correct it
- **rewrite** — restructure or reword this section
- **expand** — add more detail or coverage
- **clarify** — this is confusing, make it clearer
- **question** — I need to understand this before approving
- **remove** — this should be deleted

### 6.3 Why This Works

The LLM reads the file and sees comments as part of the content — no separate protocol to learn. CriticMarkup is well-represented in LLM training data, so models already understand it. Comments and content stay in sync because they live in the same file. Any text editor can view and edit the annotations. No sidecar files, no sync issues, no export/import steps.

### 6.4 Editor Responsibilities

The editor parses CriticMarkup and hides it from the rendered view. Comments are displayed as UI elements — colored indicators in the margin that expand into comment cards. Highlights are shown as subtle background colors on the referenced text. When the user adds a comment through the UI, the editor inserts CriticMarkup at the correct position in the raw markdown. When the user deletes a comment, the editor removes the CriticMarkup from the file.

---

## 7. Implementation Phases

### Phase 1 — Static Editor with CriticMarkup

No server required. The editor runs as a client-side application in Chrome/Edge using the File System Access API to read and write local files directly.

**Phase 1 Deliverables:**

- Folder opening and file tree navigation with nested directory support
- Rich markdown rendering: tables, syntax-highlighted code blocks, Mermaid diagrams, KaTeX math, footnotes, task lists, admonitions
- CriticMarkup parsing — annotations are hidden from the rendered view and displayed as margin comments
- Block-level commenting UI — hover to reveal comment button, select type, write comment, and CriticMarkup is inserted into the file
- Comment panel (right sidebar) showing all comments in document order with filtering by type and status. In folder mode, comments are grouped by file — file headers display the full relative path (not just the filename) to distinguish files with identical names in different directories
- Clean, Typeform-inspired reading-first design
- Optional `.markreview/config.json` for editor preferences (theme, default comment types, file filters)

### Phase 2 — Local Dev Server

Layer a local dev server on top: started via `npx markreview ./folder`.

**Phase 2 Deliverables:**

- CLI tool to launch the editor
- File watcher with WebSocket — live-reloads when the LLM modifies files
- Cross-browser support (no File System Access API dependency)
- REST API exposing file tree, file contents, and parsed comments
- Faster file operations compared to the browser API

### Phase 3 — Enhanced Collaboration (Future)

- Version diffing — when a file changes, highlight what the LLM modified versus the previous version
- Comment history — track which comments existed and when they were addressed across revisions
- Direct LLM API integration — send the file with comments to an LLM and receive the revised version without leaving the editor
- Project dashboard — overview of all files, pending comment counts, review progress across the folder

---

## 8. Core Features (Detail)

### 8.1 Folder Navigation

File tree sidebar showing the project structure with nested folders. Filters to show only `.md` files by default. Badge per file showing count of pending CriticMarkup comments. Click to open in the review pane. Collapsible sidebar to maximize reading space.

### 8.2 Rich Markdown Rendering

Standard markdown (CommonMark + GFM). Tables with proper alignment and clean styling. Fenced code blocks with syntax highlighting. Mermaid diagrams (flowcharts, sequence, ER, Gantt, mindmaps). KaTeX/LaTeX math — inline and block. Task lists, footnotes, admonitions/callouts. Article-quality typography: 16–18px body, 1.6–1.8 line height, clear heading hierarchy, comfortable paragraph spacing.

### 8.3 Block-Level Commenting UI

Every rendered block (paragraph, heading, table, code block, diagram, list item) is commentable. On hover, a subtle comment icon appears in the left margin. Clicking opens an inline comment form with type selector and text input. Existing comments show as colored dots in the margin — color-coded by type. Clicking a dot expands the comment card. The right sidebar shows all comments in document order. Filters: all, by type, pending only (CriticMarkup still present), resolved (CriticMarkup removed by the LLM).

### 8.4 Design

Typeform-inspired: the content is the interface. Light mode default with dark mode. Neutral palette — warm grays, off-white background, single accent color for interactive elements. Comment indicators are subtle until hovered. Focus mode — hide sidebar and comment margin, just the rendered document. Smooth transitions and micro-animations for comment interactions. Responsive layout for desktop and tablet.

---

## 9. Non-Functional Requirements

**Performance:** Smooth rendering for documents up to 10,000 lines. Mermaid diagrams render within 500ms. CriticMarkup parsing adds no perceptible delay.

**Browser Support:** Phase 1 requires Chrome or Edge (File System Access API). Phase 2 supports all modern browsers.

**Data:** All data lives in the user's files. No cloud, no accounts, no external services. Comments are part of the markdown files. The only metadata is an optional `.markreview/config.json`.

**Portability:** CriticMarkup is an open standard. Files annotated in MarkReview are readable in any text editor and by any LLM.

---

## 10. Success Metrics

- Time from opening a folder to leaving the first comment: under 10 seconds
- The LLM addresses CriticMarkup comments correctly without additional prompting beyond "read and address the comments in this file"
- A full review-comment-revise cycle completes in under 5 minutes
- The reading experience is rated as comfortable and clean for documents over 3,000 words
- Zero data leaves the user's machine
