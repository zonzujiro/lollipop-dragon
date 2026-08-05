import type { FileTreeNode } from "../../types/fileTree";
import type {
  PeerComment,
  QuarantinedPeerComment,
  ShareRecord,
} from "../../types/share";
import type { RelaySubscriptionState } from "../../types/relay";

export interface SharingTabState {
  shares: ShareRecord[];
  sharedPanelOpen: boolean;
  pendingComments: Record<string, PeerComment[]>;
  pendingResolveCommentIds: Record<string, string[]>;
  shareKeys: Record<string, CryptoKey>;
  activeDocId: string | null;
  incomingReviewSessions: Record<
    string,
    {
      ownerWorkspaceId: string;
      subscription: RelaySubscriptionState;
      quarantinedItems: QuarantinedPeerComment[];
    }
  >;
}

export function createSharingTabState(): SharingTabState {
  return {
    shares: [],
    sharedPanelOpen: false,
    pendingComments: {},
    pendingResolveCommentIds: {},
    shareKeys: {},
    activeDocId: null,
    incomingReviewSessions: {},
  };
}

export interface ShareContentOptions {
  ttl: number;
  nodes?: FileTreeNode[];
  label?: string;
  preparedIdentity?: PreparedShareIdentity;
}

export interface PreparedShareIdentity {
  docId: string;
  key: CryptoKey;
  keyB64: string;
}

export interface SharingActions {
  restoreShareSessions: () => Promise<void>;
  shareContent: (opts: ShareContentOptions) => Promise<string>;
  revokeShare: (docId: string) => Promise<void>;
  mergeComment: (docId: string, comment: PeerComment) => Promise<boolean>;
  dismissComment: (docId: string, cmtId: string) => void;
  clearPendingComments: (docId: string) => void;
  toggleSharedPanel: () => void;
  addPendingComment: (docId: string, comment: PeerComment) => void;
  replaceCommentsSnapshot: (docId: string, comments: PeerComment[]) => void;
  queuePendingResolve: (docId: string, cmtId: string) => boolean;
  confirmPendingResolve: (docId: string, cmtId: string) => void;
  flushPendingCommentResolves: (docId: string) => void;
  setIncomingReviewSubscription: (
    docId: string,
    subscription: RelaySubscriptionState,
  ) => void;
  quarantinePendingComment: (
    docId: string,
    cmtId: string,
    reason: string,
  ) => void;
  dismissQuarantinedComment: (docId: string, itemId: string) => boolean;
}
