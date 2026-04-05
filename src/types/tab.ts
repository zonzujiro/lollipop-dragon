import type { HydratedSidebarTreeNode } from "./fileTree";
import type { Comment, CommentType } from "./criticmarkup";
import type { ShareRecord, PeerComment } from "./share";

export interface FileCommentEntry {
  filePath: string;
  fileName: string;
  comments: Comment[];
}

export interface TabState {
  id: string;
  label: string;

  // Single file
  fileHandle: FileSystemFileHandle | null;
  fileName: string | null;
  rawContent: string;

  // Folder
  directoryHandle: FileSystemDirectoryHandle | null;
  directoryName: string | null;
  fileTree: HydratedSidebarTreeNode[];
  activeFilePath: string | null;
  sidebarOpen: boolean;

  // Comments
  comments: Comment[];
  resolvedComments: Comment[];
  activeCommentId: string | null;
  commentPanelOpen: boolean;
  commentFilter: CommentType | "all" | "pending" | "resolved";

  // Cross-file comment cache
  allFileComments: Record<string, FileCommentEntry>;
  pendingScrollTarget: {
    filePath: string;
    rawStart?: number;
    blockIndex?: number;
  } | null;

  // Write
  writeAllowed: boolean;
  undoState: { rawContent: string } | null;

  // Sharing
  shares: ShareRecord[];
  sharedPanelOpen: boolean;
  pendingComments: Record<string, PeerComment[]>;
  /** Comment IDs the host already acted on (merged/dismissed). Filters stale KV reads. */
  dismissedCommentIds: Record<string, string[]>;
  shareKeys: Record<string, CryptoKey>;
  activeDocId: string | null;

  // Restore
  restoreError: string | null;
}

export function createDefaultTab(
  overrides: Partial<TabState> & { label: string },
): TabState {
  return {
    id: crypto.randomUUID(),
    label: overrides.label,
    fileHandle: null,
    fileName: null,
    rawContent: "",
    directoryHandle: null,
    directoryName: null,
    fileTree: [],
    activeFilePath: null,
    sidebarOpen: true,
    comments: [],
    resolvedComments: [],
    activeCommentId: null,
    commentPanelOpen: false,
    commentFilter: "all",
    allFileComments: {},
    pendingScrollTarget: null,
    writeAllowed: true,
    undoState: null,
    shares: [],
    sharedPanelOpen: false,
    pendingComments: {},
    dismissedCommentIds: {},
    shareKeys: {},
    activeDocId: null,
    restoreError: null,
    ...overrides,
  };
}
