import type { StoreApi } from "zustand";
import type { CommentType } from "../../types/criticmarkup";
import type { PeerComment } from "../../types/share";
import {
  loadPeerSharedContent,
  syncUnsubmittedPeerComments,
} from "./controller";
import type { PeerReviewActions, PeerReviewState } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];
type GetState<StoreState> = StoreApi<StoreState>["getState"];

function createPeerComment(
  peerName: string | null,
  blockIndex: number,
  type: CommentType,
  text: string,
  path: string,
): PeerComment {
  return {
    id: `c_${crypto.randomUUID()}`,
    peerName: peerName ?? "Anonymous",
    path,
    blockRef: { blockIndex, contentPreview: "" },
    commentType: type,
    text,
    createdAt: new Date().toISOString(),
  };
}

export function createPeerReviewState(): PeerReviewState {
  return {
    isPeerMode: false,
    peerName: null,
    sharedContent: null,
    myPeerComments: [],
    submittedPeerCommentIds: [],
    peerShareKeys: {},
    peerActiveDocId: null,
    peerRawContent: "",
    peerFileName: null,
    peerActiveFilePath: null,
    peerResolvedComments: [],
    peerComments: [],
    peerCommentPanelOpen: false,
  };
}

export function createPeerReviewActions<StoreState extends PeerReviewState>(
  set: SetState<StoreState>,
  get: GetState<StoreState>,
): PeerReviewActions {
  return {
    setPeerName: (name) => {
      set({ peerName: name });
    },

    selectPeerFile: (path) => {
      const { sharedContent } = get();
      if (!sharedContent) {
        return;
      }

      const content = sharedContent.tree[path];
      if (content === undefined) {
        return;
      }

      set({
        peerRawContent: content,
        peerFileName: path,
        peerActiveFilePath: path,
        peerResolvedComments: [],
      });
    },

    loadSharedContent: async () => {
      await loadPeerSharedContent(get, set);
    },

    postPeerComment: (blockIndex, type, text, path) => {
      const comment = createPeerComment(get().peerName, blockIndex, type, text, path);
      set((state) => ({
        myPeerComments: [comment, ...state.myPeerComments],
      }));
    },

    deletePeerComment: (commentId) => {
      set((state) => ({
        myPeerComments: state.myPeerComments.filter(
          (comment) => comment.id !== commentId,
        ),
        submittedPeerCommentIds: state.submittedPeerCommentIds.filter(
          (submittedId) => submittedId !== commentId,
        ),
      }));
    },

    editPeerComment: (commentId, type, text) => {
      set((state) => ({
        myPeerComments: state.myPeerComments.map((comment) =>
          comment.id === commentId
            ? { ...comment, commentType: type, text }
            : comment,
        ),
      }));
    },

    syncPeerComments: async () => {
      await syncUnsubmittedPeerComments(get);
    },

    confirmPeerCommentSubmitted: (cmtId) => {
      set((state) => {
        if (state.submittedPeerCommentIds.includes(cmtId)) {
          return {};
        }

        return {
          submittedPeerCommentIds: [...state.submittedPeerCommentIds, cmtId],
        };
      });
    },
  };
}
