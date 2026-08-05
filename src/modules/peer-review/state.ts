import type { StoreApi } from "zustand";
import type { CommentType } from "../../types/criticmarkup";
import type { PeerComment } from "../../types/share";
import type { RelayState } from "../relay";
import { getBlockPlainTextMap, parseCriticMarkup } from "../../markup";
import type { PeerReviewActions, PeerReviewState } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];
type GetState<StoreState> = StoreApi<StoreState>["getState"];

const MAX_PEER_COMMENT_INPUT_LENGTH = 400 * 1024;

function createPeerComment(input: {
  peerName: string | null;
  blockIndex: number;
  type: CommentType;
  text: string;
  path: string;
  anchor?: {
    quote: string;
    occurrence: number;
  };
  rawContent: string;
}): PeerComment {
  const parsed = parseCriticMarkup(input.rawContent);
  const blockMap = getBlockPlainTextMap(parsed.cleanMarkdown, input.blockIndex);
  return {
    id: `c_${crypto.randomUUID()}`,
    peerName: input.peerName ?? "Anonymous",
    path: input.path,
    blockRef: {
      blockIndex: input.blockIndex,
      contentPreview: blockMap?.plainText.slice(0, 80) ?? "",
      ...(input.anchor
        ? {
            anchorVersion: 1,
            quote: input.anchor.quote,
            occurrence: input.anchor.occurrence,
          }
        : {}),
    },
    commentType: input.type,
    text: input.text,
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
    peerActiveCommentId: null,
    peerSubmissionSubscription: null,
  };
}

export function createPeerReviewActions<
  StoreState extends PeerReviewState &
    Pick<RelayState, "documentUpdateAvailable">,
>(
  set: SetState<StoreState>,
  get: GetState<StoreState>,
): Pick<
  PeerReviewActions,
  | "leavePeerMode"
  | "setPeerName"
  | "selectPeerFile"
  | "postPeerComment"
  | "deletePeerComment"
  | "editPeerComment"
  | "setPeerDraftCommentOpen"
  | "discardUnsubmittedPeerComments"
  | "confirmPeerCommentSubmitted"
  | "setPeerSubmissionSubscription"
> {
  return {
    leavePeerMode: () => {
      set({
        isPeerMode: false,
        peerSubmissionSubscription: null,
      });
    },
    setPeerName: (name) => {
      set((state) => {
        const submittedCommentIds = new Set(state.submittedPeerCommentIds);
        return {
          peerName: name,
          myPeerComments: state.myPeerComments.map((comment) =>
            submittedCommentIds.has(comment.id)
              ? comment
              : { ...comment, peerName: name },
          ),
        };
      });
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
        peerActiveCommentId: null,
      });
    },

    postPeerComment: (input) => {
      if (get().documentUpdateAvailable) {
        return false;
      }
      if (
        input.text.length > MAX_PEER_COMMENT_INPUT_LENGTH ||
        (input.anchor?.quote.length ?? 0) > MAX_PEER_COMMENT_INPUT_LENGTH
      ) {
        return false;
      }
      const comment = createPeerComment({
        ...input,
        peerName: get().peerName,
        rawContent: get().peerRawContent,
      });
      set((state) => ({
        myPeerComments: [comment, ...state.myPeerComments],
        peerDraftCommentOpen: false,
      }));
      return true;
    },

    deletePeerComment: (commentId) => {
      set((state) => ({
        myPeerComments: state.myPeerComments.filter(
          (comment) => comment.id !== commentId,
        ),
        submittedPeerCommentIds: state.submittedPeerCommentIds.filter(
          (submittedId) => submittedId !== commentId,
        ),
        peerActiveCommentId:
          state.peerActiveCommentId === commentId
            ? null
            : state.peerActiveCommentId,
      }));
    },

    editPeerComment: (commentId, type, text) => {
      if (text.length > MAX_PEER_COMMENT_INPUT_LENGTH) {
        return;
      }
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
    setPeerSubmissionSubscription: (subscription) => {
      set({ peerSubmissionSubscription: subscription });
    },
  };
}
