import type { PeerComment } from "../../types/share";
import type { PeerReviewState } from "./types";

export function selectIsPeerMode<StoreState extends PeerReviewState>(
  state: StoreState,
) {
  return state.isPeerMode;
}

export function selectPeerName<StoreState extends PeerReviewState>(
  state: StoreState,
) {
  return state.peerName;
}

export function selectPeerSharedContent<StoreState extends PeerReviewState>(
  state: StoreState,
) {
  return state.sharedContent;
}

export function selectPeerRawContent<StoreState extends PeerReviewState>(
  state: StoreState,
) {
  return state.peerRawContent;
}

export function selectPeerFileName<StoreState extends PeerReviewState>(
  state: StoreState,
) {
  return state.peerFileName;
}

export function selectPeerActiveFilePath<StoreState extends PeerReviewState>(
  state: StoreState,
) {
  return state.peerActiveFilePath;
}

export function selectPeerCommentPanelOpen<StoreState extends PeerReviewState>(
  state: StoreState,
) {
  return state.peerCommentPanelOpen;
}

export function selectMyPeerComments<StoreState extends PeerReviewState>(
  state: StoreState,
) {
  return state.myPeerComments;
}

export function selectPeerDraftCommentOpen<StoreState extends PeerReviewState>(
  state: StoreState,
) {
  return state.peerDraftCommentOpen;
}

export function selectUnsubmittedPeerComments<
  StoreState extends Pick<
    PeerReviewState,
    "myPeerComments" | "submittedPeerCommentIds"
  >,
>(state: StoreState): PeerComment[] {
  return state.myPeerComments.filter(
    (comment) => !state.submittedPeerCommentIds.includes(comment.id),
  );
}

export function selectHasPeerLocalCommentWork<
  StoreState extends Pick<
    PeerReviewState,
    "peerDraftCommentOpen" | "myPeerComments" | "submittedPeerCommentIds"
  >,
>(state: StoreState): boolean {
  return (
    state.peerDraftCommentOpen || selectUnsubmittedPeerComments(state).length > 0
  );
}
