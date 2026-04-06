import type { Comment, CommentType } from "../../types/criticmarkup";

export type HostCommentFilter =
  | CommentType
  | "all"
  | "pending"
  | "resolved";

export interface FileCommentEntry {
  filePath: string;
  fileName: string;
  comments: Comment[];
}

export interface PendingScrollTarget {
  filePath: string;
  rawStart?: number;
  blockIndex?: number;
}

export interface UndoState {
  rawContent: string;
}

export interface HostReviewTabState {
  comments: Comment[];
  resolvedComments: Comment[];
  activeCommentId: string | null;
  commentPanelOpen: boolean;
  commentFilter: HostCommentFilter;
  allFileComments: Record<string, FileCommentEntry>;
  pendingScrollTarget: PendingScrollTarget | null;
  writeAllowed: boolean;
  undoState: UndoState | null;
}

export function createHostReviewTabState(): HostReviewTabState {
  return {
    comments: [],
    resolvedComments: [],
    activeCommentId: null,
    commentPanelOpen: false,
    commentFilter: "all",
    allFileComments: {},
    pendingScrollTarget: null,
    writeAllowed: true,
    undoState: null,
  };
}

export interface HostReviewActions {
  setComments: (comments: Comment[]) => void;
  setActiveCommentId: (id: string | null) => void;
  toggleCommentPanel: () => void;
  setCommentFilter: (filter: HostCommentFilter) => void;
  addComment: (
    blockIndex: number,
    type: CommentType,
    text: string,
  ) => Promise<void>;
  editComment: (id: string, type: CommentType, text: string) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
  deleteAllComments: () => Promise<void>;
  undo: () => Promise<void>;
  clearUndo: () => void;
  scanAllFileComments: () => Promise<void>;
  navigateToComment: (filePath: string, rawStart: number) => void;
  navigateToBlock: (filePath: string, blockIndex: number) => void;
  clearPendingScrollTarget: () => void;
}
