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

**Step 4:** Developer uses MarkReview's review prompt to tell the LLM CLI to review the current file. For standard comments, the LLM sees the comments inline, makes the fixes, and removes the markup. For threaded `question:` comments, the same prompt asks the agent to answer inline with a linked `answer:` reply instead of rewriting the original question.

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
- **answer** — a reply linked to an existing `question:` thread root
- **remove** — this should be deleted

The file parser continues to support every type above for compatibility with
existing CriticMarkup and comments created by external tools. In the app UI,
new comments and user-authored action replies support **question**, **clarify**,
**rewrite**, and **remove**. The host Comments panel exposes each of those types
as a filter when it is present. Every visible filter must be functional and show
the taxonomy color mark defined by the reference prototype. **All** still
includes legacy comment types. Keyboard shortcuts follow the available composer
actions.

### 6.3 Threaded Question / Answer Extension

MarkReview extends the plain comment protocol for threaded review questions.

- A `question:` comment can be a thread root.
- MarkReview writes hidden `[markreview ...]` metadata into app-created `question:` comments so a raw markdown file still carries stable thread identifiers.
- Agents reply with a separate inline `answer:` CriticMarkup comment near the same text block.
- Users can also reply directly from the thread card; MarkReview writes the same linked `answer:` CriticMarkup reply with `author="You"`.
- The thread composer shows action buttons for `clarify` and `rewrite`. With no action selected, the message is a normal `answer:` reply. Selecting an action writes that type as a linked threaded CriticMarkup comment with `author="You"`; selecting the active action again returns to reply behavior.
- Every reply reuses the root `thread` value. Its `replyTo` can reference the
  root question `id` or an earlier reply `id` when answering a follow-up.
- The UI resolves reply ancestry within the same thread and renders every valid
  descendant in conversation order: a reply appears directly after the message
  it answers, while sibling replies keep their document order. Broken,
  mismatched, or cyclic reply chains stay visible as standalone comments instead
  of disappearing.
- The reply can also include `author` so the UI can show `Codex`, `Cursor`, or a generic `Agent` label.
- The Comments panel always renders linked replies beneath the root question and marks the root as `answered` once an `answer:` reply exists. Selecting the root keeps the complete conversation in place and adds the reply composer and comment actions, including in folder mode where the thread remains under its file-path header.
- Thread rail visuals follow `docs/redesign/reference-prototype/index.html`: the
  root and replies share one standard comment card, replies use compact avatar
  rows beneath a dashed divider and answer-colored left rule, and selected
  state adds the taxonomy-colored focus ring without a nested `Thread` header.
  Threads longer than three replies show the first and last reply around an
  expandable `N more replies` control.
- Agent-authored replies render as read-only comments in the UI. Before a
  question is answered, user-authored thread messages retain their existing edit
  and delete actions; the same ownership check gates both actions, so an
  agent-authored non-answer reply cannot be deleted from an otherwise unanswered
  thread. Once the thread contains an `answer:` reply, the root and every reply
  become immutable in the UI: Edit and reply-level Delete are unavailable,
  while the root keeps its Resolve action and the reply composer remains
  available so the discussion can continue. Resolving the root removes the
  completed question and all of its linked replies.
- Thread cards visually distinguish user-authored answers from external or agent-authored answers so ownership is clear at a glance.
- The thread composer starts as a compact single-row field, grows up to four
  lines as the user types, and keeps its submit arrow inside the field. Enter
  submits, while Shift+Enter inserts a line break. A compact row of action
  buttons sits above the field; no separate Reply/Action mode switch is shown.
- Threaded action replies are work instructions, not conversational answers. The review-agent prompt tells agents to apply the requested edit directly, remove the resolved thread after the edit, and avoid adding a confirmation `answer:` reply.
- While an editable message in an unanswered thread is being edited or
  delete-confirmed, the composer is hidden so the user sees only one active input
  surface. If an answer arrives during that interaction, edit and reply-delete
  state closes immediately; a root Resolve confirmation remains valid.
- Deleting a thread-root `question:` comment deletes the linked `answer:` replies in the same thread so replies never remain as orphan comments.

Example root:

```text
{>>question: Why is this section needed? [markreview id="mr-question-1" thread="mr-question-1"]<<}
```

Example reply:

```text
{>>answer: This section explains the reconnect fallback path after a missed live event. [markreview id="mr-answer-1" thread="mr-question-1" replyTo="mr-question-1" author="Codex"]<<}
```

Example action reply:

```text
{>>remove: Delete BL-2 from this section. [markreview id="mr-action-1" thread="mr-question-1" replyTo="mr-question-1" author="You"]<<}
```

### 6.4 Character-range anchors and overlaps

Selecting 3–300 characters inside one rendered block opens a range-aware
composer. The comment stores an exact quote, its 1-based occurrence within the
block's rendered plain text, and derived start/end offsets. A clean range is
serialized by wrapping the original markdown slice:

```text
{==selected text==}{>>fix: Tighten this claim.<<}
```

If the selected range intersects existing CriticMarkup, nesting is avoided. The
new comment is appended to the block with a durable standalone anchor:

```text
{>>clarify: Explain the distinction. @@ "selected text" @2<<}
```

The parser re-resolves anchors whenever file content changes. It first uses the
stored occurrence, then another exact occurrence, then a whitespace-normalized
match. If none matches, the comment remains open as an orphan with its quote and
an “anchor released” note; no text is mis-highlighted. Returning the quote to the
block reattaches it automatically.

Intersecting ranges render as constant-coverage segments. Shared segments stack
their tints and underline stripes, expose all comment IDs through `data-cids`,
and cycle the selected comment when activated repeatedly.

### 6.5 Why This Works

For standard comments, the LLM reads the file and sees comments as part of the content — no separate protocol to learn. CriticMarkup is well-represented in LLM training data, so models already understand it. For threaded `question:` comments, MarkReview adds a small metadata extension plus the unified review prompt so replies stay linked without introducing sidecar files. Comments and content still stay in sync because everything lives in the same file. Any text editor can view and edit the annotations. No sidecar files, no sync issues, no export/import steps.

### 6.6 Editor Responsibilities

The editor parses CriticMarkup and hides it from the rendered view. Comments are displayed as UI elements — colored indicators in the margin that expand into comment cards. Highlights are shown as subtle background colors on the referenced text. When the user adds a comment through the UI, the editor inserts CriticMarkup at the correct position in the raw markdown. App-created `question:` comments receive hidden thread metadata so later `answer:` replies can link back to them. When the user deletes a comment, the editor removes the CriticMarkup from the file.

---

## 7. Implementation Phases

### Phase 1 — Static Editor with CriticMarkup

No server required. The editor runs as a client-side application in Chrome/Edge using the File System Access API to read and write local files directly.

**Phase 1 Deliverables:**

- Folder opening and file tree navigation with nested directory support
- Rich markdown rendering: tables, syntax-highlighted code blocks, Mermaid diagrams, KaTeX math, footnotes, task lists, admonitions
- Header table-of-contents navigation for markdown headings, with the popover opening above the document surface rather than being clipped by header toolbar overflow
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

File tree sidebar showing the project structure with nested folders. Filters to show only `.md` files by default. Badge per file showing count of pending CriticMarkup comments. Click to open in the review pane. The collapse control lives in the file-tree header beside the folder actions; while collapsed, a compact control at the document's left edge restores the tree. `Cmd+B` / `Ctrl+B` continues to toggle the active tab's sidebar.

### 8.2 Rich Markdown Rendering

Standard markdown (CommonMark + GFM). Tables with proper alignment and clean styling. Fenced code blocks with syntax highlighting. Mermaid diagrams (flowcharts, sequence, ER, Gantt, mindmaps). KaTeX/LaTeX math — inline and block. Task lists, footnotes, admonitions/callouts. Article-quality typography: 16–18px body, 1.6–1.8 line height, clear heading hierarchy, comfortable paragraph spacing.

Markdown files may start with YAML-style frontmatter metadata. The rendered
review surface hides the raw frontmatter from the document body and displays it
as a quiet metadata panel before the first rendered heading. Its compact title
keeps the panel's standard padding and must not inherit the document heading's
size or top margin. Scalar values render
as label/value rows, while list-style fields such as participants, tags, extends,
amends, and relates render as compact chips. Comment anchors and inserted
CriticMarkup comments still target the rendered document body, not the hidden
metadata block.

The reading surface follows the available review pane instead of using a narrow
article column. The viewer occupies 90% of the pane up to 1498px, reserving a
48px comment lane and leaving up to 1450px for document content. The filename
kicker and metadata panel align with the prose. Opening navigation or comment
rails shrinks the surface fluidly without horizontal overflow.

### 8.3 Block and range commenting UI

Every rendered block (paragraph, heading, table, code block, diagram, list item) is commentable. On hover, a 26px dashed rounded-square `+` appears in the left margin; it uses the quiet paper surface until hover or keyboard focus applies the accent color. Selecting text inside a block preserves the browser selection for copying and exposes a floating **Comment** action. The range composer opens only after that explicit action, using the selected quote, range-safe CriticMarkup serialization, the four user comment types (question, clarify, rewrite, remove), and a clear notice that the comment is written into the file. Existing comments use 26px raised rounded-square markers with an 8px taxonomy-colored center; selecting one applies a taxonomy-colored border and soft focus ring. Marker stacks from adjacent blocks are collision-resolved in document order with a 4px gap, including mixed host and peer markers, and the hovered block's add button moves to the next free marker slot. Anchored ranges also render overlap-aware highlights and underline stripes. Clicking a shared highlight cycles through its comments. Clicking a marker opens the comment rail when needed, selects the matching rail card and highlight, and does not create a duplicate floating thread popup. Only the add-comment composer floats and remains draggable. The host right rail shows open comments in document order, exposes functional question, clarify, rewrite, and remove filters whenever those types are present, and exposes view-only resolved history for the current tab. Its shortcut footer renders `J`, `K`, `C`, and `⌘K` as individual bordered keycaps. Orphaned range comments keep their quote and display the anchor-released note. Bulk resolution requires confirmation.

The click emitted by the browser after a drag selection must not dismiss the floating Comment action or collapse the browser selection. Clicking that action opens the range composer; starting a new selection, scrolling, or explicitly dismissing clears the pending action. These interactions are verified separately from block-level comment creation.

Keyboard navigation follows the same ordering: `J`/`K` select the next or previous open comment across files, `C` opens a block composer, and `Cmd+K`/`Ctrl+K` opens the command palette. `Esc` closes the topmost palette, composer, or selection.

#### Code fences and Mermaid diagrams

Code ranges use the fence's plain text, independent of syntax-highlight spans.
The hover gutter displays line numbers with CSS counters so numbers never enter
`textContent`; activating a focusable line target anchors the trimmed whole line.
Fence comments always use standalone `@@ "quote" @n` markup after the closing
fence, leaving the fenced bytes unchanged.

Mermaid blocks expose diagram/source chips outside the anchored source root.
Source view behaves like a code fence. In diagram view, activating a focusable
node anchors its label occurrence in the Mermaid source. Resolved node anchors
project as taxonomy-colored node rings and focusable corner pins; selected
comments use a stronger ring and stacked comments receive separate pins. The
view choice and rendered coordinates are never persisted. Renaming a label
releases the anchor without moving it elsewhere, and restoring the label
reattaches it. Host and peer comments share this model.

### 8.4 Design

Typeform-inspired: the content is the interface. Light mode default with dark mode. Neutral palette — warm grays, off-white background, single accent color for interactive elements. The document pane uses the lighter raised reading surface, while both side rails use the warm page background; the darker sunken token is reserved for wells and secondary controls. The global header uses the Lollipop Dragon mark instead of repeating whether the active tab is a file or folder review; the tab bar and file tree already provide that context. Comment indicators are subtle until hovered. Focus mode — hide sidebar and comment margin, just the rendered document. Smooth transitions and micro-animations for comment interactions. Responsive layout for desktop and tablet.

---

## 9. Non-Functional Requirements

**Performance:** Smooth rendering for documents up to 10,000 lines. Mermaid diagrams render within 500ms. CriticMarkup parsing adds no perceptible delay.

**Browser Support:** Phase 1 requires Chrome or Edge (File System Access API). Phase 2 supports all modern browsers.

**Data:** All data lives in the user's files. No cloud, no accounts, no external services. Comments are part of the markdown files. The only metadata is an optional `.markreview/config.json`.

**Portability:** CriticMarkup is an open standard. Files annotated in MarkReview are readable in any text editor and by any LLM.

---

## 10. Success Metrics

- Time from opening a folder to leaving the first comment: under 10 seconds
- The LLM addresses standard CriticMarkup comments correctly without additional prompting beyond "read and address the comments in this file"
- Threaded `question:` comments can be answered by the user in the thread card or handed off with the review prompt, and the resulting `answer:` replies render as linked inline threads
- A full review-comment-revise cycle completes in under 5 minutes
- The reading experience is rated as comfortable and clean for documents over 3,000 words
- Zero data leaves the user's machine
