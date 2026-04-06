import type { FileTreeNode } from "../../types/fileTree";
import type { PeerComment, ShareRecord } from "../../types/share";

export interface SharingTabState {
  shares: ShareRecord[];
  sharedPanelOpen: boolean;
  pendingComments: Record<string, PeerComment[]>;
  pendingResolveCommentIds: Record<string, string[]>;
  shareKeys: Record<string, CryptoKey>;
  activeDocId: string | null;
}

export function createSharingTabState(): SharingTabState {
  return {
    shares: [],
    sharedPanelOpen: false,
    pendingComments: {},
    pendingResolveCommentIds: {},
    shareKeys: {},
    activeDocId: null,
  };
}

export interface ShareContentOptions {
  ttl: number;
  nodes?: FileTreeNode[];
  label?: string;
}

export interface SharingActions {
  restoreShareSessions: () => Promise<void>;
  shareContent: (opts: ShareContentOptions) => Promise<string>;
  revokeShare: (docId: string) => Promise<void>;
  mergeComment: (docId: string, comment: PeerComment) => Promise<void>;
  dismissComment: (docId: string, cmtId: string) => void;
  clearPendingComments: (docId: string) => void;
  toggleSharedPanel: () => void;
  addPendingComment: (docId: string, comment: PeerComment) => void;
  replaceCommentsSnapshot: (docId: string, comments: PeerComment[]) => void;
  queuePendingResolve: (docId: string, cmtId: string) => void;
  confirmPendingResolve: (docId: string, cmtId: string) => void;
  flushPendingCommentResolves: (docId: string) => void;
}
