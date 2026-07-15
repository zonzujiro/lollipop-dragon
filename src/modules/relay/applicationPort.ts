import type { PeerReviewActions, PeerReviewState } from "../peer-review/types";
import type { SharingActions } from "../sharing/types";
import type { WorkspaceState } from "../workspace/types";
import type { RelayActions, RelayState } from "./types";

export type RelayApplicationState = Pick<WorkspaceState, "tabs"> &
  Pick<
    PeerReviewState,
    | "isPeerMode"
    | "peerActiveDocId"
    | "peerDraftCommentOpen"
    | "peerLoadedUpdatedAt"
    | "peerShareKeys"
    | "myPeerComments"
    | "submittedPeerCommentIds"
  > &
  Pick<
    PeerReviewActions,
    | "confirmPeerCommentSubmitted"
    | "deletePeerComment"
    | "loadSharedContent"
    | "syncPeerComments"
  > &
  Pick<
    SharingActions,
    | "addPendingComment"
    | "confirmPendingResolve"
    | "flushPendingCommentResolves"
    | "replaceCommentsSnapshot"
  > &
  Pick<RelayState, "documentUpdateAvailable"> &
  RelayActions;

export interface RelayApplicationPort {
  getState: () => RelayApplicationState;
}

let applicationPort: RelayApplicationPort | null = null;

export function configureRelayApplicationPort(
  port: RelayApplicationPort,
): void {
  applicationPort = port;
}

export function getRelayApplicationState(): RelayApplicationState {
  if (!applicationPort) {
    throw new Error("Relay application port has not been configured");
  }
  return applicationPort.getState();
}
