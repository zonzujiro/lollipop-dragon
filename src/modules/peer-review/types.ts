import type { Comment, CommentType } from "../../types/criticmarkup";
import type { PeerComment, SharePayload } from "../../types/share";

export interface PeerReviewState {
  isPeerMode: boolean;
  peerName: string | null;
  sharedContent: SharePayload | null;
  peerDraftCommentOpen: boolean;
  myPeerComments: PeerComment[];
  submittedPeerCommentIds: string[];
  peerShareKeys: Record<string, CryptoKey>;
  peerActiveDocId: string | null;
  peerLoadedUpdatedAt: string | null;
  peerRawContent: string;
  peerFileName: string | null;
  peerActiveFilePath: string | null;
  peerResolvedComments: Comment[];
  peerComments: Comment[];
  peerCommentPanelOpen: boolean;
}

export interface PeerReviewActions {
  setPeerName: (name: string) => void;
  loadSharedContent: (options?: { discardUnsubmitted?: boolean }) => Promise<void>;
  selectPeerFile: (path: string) => void;
  postPeerComment: (
    blockIndex: number,
    type: CommentType,
    text: string,
    path: string,
  ) => void;
  deletePeerComment: (commentId: string) => void;
  editPeerComment: (commentId: string, type: CommentType, text: string) => void;
  setPeerDraftCommentOpen: (open: boolean) => void;
  discardUnsubmittedPeerComments: () => void;
  syncPeerComments: () => Promise<void>;
  confirmPeerCommentSubmitted: (cmtId: string) => void;
}
