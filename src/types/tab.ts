import type { HydratedSidebarTreeNode } from "./fileTree";
import type { Comment, CommentType } from "./criticmarkup";
import {
  createSharingTabState,
  type SharingTabState,
} from "../modules/sharing/types";

export interface FileCommentEntry {
  filePath: string;
  fileName: string;
  comments: Comment[];
}

export interface TabState extends SharingTabState {
  id: string;
  label: string;

  fileHandle: FileSystemFileHandle | null;
  fileName: string | null;
  rawContent: string;

  directoryHandle: FileSystemDirectoryHandle | null;
  directoryName: string | null;
  fileTree: HydratedSidebarTreeNode[];
  activeFilePath: string | null;
  sidebarOpen: boolean;

  comments: Comment[];
  resolvedComments: Comment[];
  activeCommentId: string | null;
  commentPanelOpen: boolean;
  commentFilter: CommentType | "all" | "pending" | "resolved";

  allFileComments: Record<string, FileCommentEntry>;
  pendingScrollTarget: {
    filePath: string;
    rawStart?: number;
    blockIndex?: number;
  } | null;

  writeAllowed: boolean;
  undoState: { rawContent: string } | null;

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
    ...createSharingTabState(),
    restoreError: null,
    ...overrides,
  };
}
