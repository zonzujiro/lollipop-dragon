import type { StoreApi } from "zustand";
import type { CommentType } from "../../types/criticmarkup";
import type { PeerComment } from "../../types/share";
import type { RelayState } from "../relay";
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
    peerDraftCommentOpen: false,
    myPeerComments: [],
    submittedPeerCommentIds: [],
    peerShareKeys: {},
    peerActiveDocId: null,
    peerLoadedUpdatedAt: null,
    peerRawContent: "",
    peerFileName: null,
    peerActiveFilePath: null,
    peerResolvedComments: [],
    peerComments: [],
    peerCommentPanelOpen: false,
  };
}

export function createPeerReviewActions<
  StoreState extends PeerReviewState & Pick<RelayState, "documentUpdateAvailable">,
>(
  set: SetState<StoreState>,
  get: GetState<StoreState>,
): PeerReviewActions {
  return {
    setPeerName: (name) => {
      set({ peerName: name });
    },

    setPeerDraftCommentOpen: (open) => {
      set({ peerDraftCommentOpen: open });
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

    loadSharedContent: async (options) => {
      await loadPeerSharedContent(get, set, options);
    },

    postPeerComment: (blockIndex, type, text, path) => {
      if (get().documentUpdateAvailable) {
        return;
      }
      const comment = createPeerComment(
        get().peerName,
        blockIndex,
        type,
        text,
        path,
      );
      set((state) => ({
        myPeerComments: [comment, ...state.myPeerComments],
        peerDraftCommentOpen: false,
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

    discardUnsubmittedPeerComments: () => {
      set((state) => ({
        myPeerComments: state.myPeerComments.filter((comment) =>
          state.submittedPeerCommentIds.includes(comment.id),
        ),
        peerDraftCommentOpen: false,
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
