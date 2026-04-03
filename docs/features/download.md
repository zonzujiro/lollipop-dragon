# MarkReview — Download Shared Content

## 1 Overview

Peers can download shared content from the review session. The feature provides a **Save file** action (always available in peer mode) and a planned **Save folder** action (for when a folder was shared).

## 2 Context

Peers viewing shared content have no way to save it locally. This feature adds browser-based downloads so peers can keep a copy for offline reference. All download logic runs client-side — the encryption key never leaves the URL fragment.

## 3 Scope

### Implemented (v1)

| Action    | Trigger                    | Output            | Icon        |
| --------- | -------------------------- | ----------------- | ----------- |
| Save file | Header button in peer mode | Single `.md` file | Floppy disk |

- Downloads the currently viewed file using its original file name
- Uses `Blob` + `URL.createObjectURL` to trigger a browser download
- The store action (`downloadActiveFile`) is mode-agnostic: it reads from peer state or active tab depending on `isPeerMode`, so it can be reused in host mode later

### Planned (v2)

| Action      | Trigger                                              | Output         | Icon        |
| ----------- | ---------------------------------------------------- | -------------- | ----------- |
| Save folder | Header button in peer mode (only when folder shared) | `.zip` archive | Archive/zip |

- Downloads all files from `sharedContent.tree` as a zip preserving the original folder hierarchy
- Requires `jszip` dependency (deferred due to network unavailability at implementation time)
- Button should only be visible when the shared content contains multiple files

## 4 Technical Details

### Files

| File                               | Role                                                             |
| ---------------------------------- | ---------------------------------------------------------------- |
| `src/services/download.ts`         | `downloadActiveFile()` — reads store state and triggers download |
| `src/components/Header/Header.tsx` | "Save file" button with floppy disk icon in peer mode section    |

### Download flow

1. User clicks "Save file" in the header
2. `downloadActiveFile()` reads `peerActiveFilePath` and `peerRawContent` from the store (or tab state in host mode)
3. Extracts the file name from the path
4. Calls `downloadFile(fileName, rawContent)` which creates a `text/markdown` Blob and triggers download via a temporary anchor element

### Constraints

- Downloaded `.md` files include raw CriticMarkup syntax (e.g., ``) — this is the source content, not the rendered view
- No server involvement — everything happens in the browser
- File metadata (timestamps, etc.) is not preserved; downloaded files get the current system timestamp
