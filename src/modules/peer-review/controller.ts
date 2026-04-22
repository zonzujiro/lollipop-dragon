import type { StoreApi } from "zustand";
import { base64urlToKey, docIdFromKey } from "../../services/crypto";
import {
  relayCommentAdd,
  startRelayForDoc,
} from "../relay";
import type { RelayState } from "../relay";
import { ShareStorage } from "../sharing";
import { WORKER_URL } from "../../config";
import { parseShareHash } from "../../utils/shareUrl";
import { selectUnsubmittedPeerComments } from "./selectors";
import type { PeerReviewState } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];

function getPeerReviewStorage(): ShareStorage | null {
  if (!WORKER_URL) {
    return null;
  }
  return new ShareStorage(WORKER_URL);
}

export async function loadPeerSharedContent<StoreState extends PeerReviewState>(
  get: () => StoreState,
  set: SetState<StoreState>,
  options?: { discardUnsubmitted?: boolean },
): Promise<void> {
  const parsed = parseShareHash();
  if (!parsed) {
    return;
  }
  const storage = getPeerReviewStorage();
  if (!storage) {
    return;
  }
  const hadLoadedContent = get().sharedContent !== null;
  const key = await base64urlToKey(parsed.keyB64);
  const docId = await docIdFromKey(key);

  try {
    const payload = await storage.fetchContent(docId, key);
    const loadedUpdatedAt =
      (await storage.fetchLastModified(docId).catch(() => null)) ??
      payload.created_at;
    const currentPath = get().peerActiveFilePath;
    const paths = Object.keys(payload.tree);
    const activePath =
      currentPath && currentPath in payload.tree
        ? currentPath
        : (paths[0] ?? null);

    set((state) => ({
      isPeerMode: true,
      sharedContent: payload,
      peerShareKeys: { ...state.peerShareKeys, [docId]: key },
      peerRawContent: activePath ? payload.tree[activePath] : "",
      peerFileName: activePath,
      peerActiveFilePath: activePath,
      peerActiveDocId: docId,
      peerLoadedUpdatedAt: loadedUpdatedAt,
      peerDraftCommentOpen: false,
      myPeerComments: options?.discardUnsubmitted
        ? state.myPeerComments.filter((comment) =>
            state.submittedPeerCommentIds.includes(comment.id),
          )
        : state.myPeerComments,
    }));

    startRelayForDoc(docId);
  } catch (error) {
    if (!hadLoadedContent) {
      set({
        isPeerMode: true,
        sharedContent: null,
        peerLoadedUpdatedAt: null,
      });
    } else {
      set({ isPeerMode: true });
    }
    console.error("[share] Failed to load shared content:", error);
    throw error;
  }
}

export async function syncUnsubmittedPeerComments<
  StoreState extends Pick<
    PeerReviewState,
    "myPeerComments" | "submittedPeerCommentIds"
  > &
    Pick<RelayState, "documentUpdateAvailable">,
>(
  get: () => StoreState,
): Promise<void> {
  if (get().documentUpdateAvailable) {
    return;
  }
  const parsed = parseShareHash();
  if (!parsed) {
    return;
  }

  const key = await base64urlToKey(parsed.keyB64);
  const docId = await docIdFromKey(key);
  const unsubmittedComments = selectUnsubmittedPeerComments(get());

  if (unsubmittedComments.length === 0) {
    return;
  }

  for (const comment of unsubmittedComments) {
    await relayCommentAdd(docId, comment.id, comment, key);
  }
}
