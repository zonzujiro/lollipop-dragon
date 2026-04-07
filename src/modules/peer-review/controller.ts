import type { StoreApi } from "zustand";
import { base64urlToKey, docIdFromKey } from "../../services/crypto";
import {
  relayCommentAdd,
  startRelayForDoc,
} from "../relay";
import { ShareStorage } from "../sharing";
import { WORKER_URL } from "../../config";
import { parseShareHash } from "../../utils/shareUrl";
import { selectUnsubmittedPeerComments } from "./selectors";
import type { PeerReviewActions, PeerReviewState } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];
type GetState<StoreState> = StoreApi<StoreState>["getState"];

function getPeerReviewStorage(): ShareStorage | null {
  if (!WORKER_URL) {
    return null;
  }
  return new ShareStorage(WORKER_URL);
}

export async function loadPeerSharedContent<StoreState extends PeerReviewState>(
  get: () => StoreState,
  set: SetState<StoreState>,
): Promise<void> {
  const parsed = parseShareHash();
  if (!parsed) {
    return;
  }
  const storage = getPeerReviewStorage();
  if (!storage) {
    return;
  }
  const key = await base64urlToKey(parsed.keyB64);
  const docId = await docIdFromKey(key);

  try {
    const payload = await storage.fetchContent(docId, key);
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
    }));

    startRelayForDoc(docId);
  } catch (error) {
    set({ isPeerMode: true, sharedContent: null });
    console.error("[share] Failed to load shared content:", error);
  }
}

export async function syncUnsubmittedPeerComments<
  StoreState extends Pick<
    PeerReviewState,
    "myPeerComments" | "submittedPeerCommentIds"
  >,
>(get: () => StoreState): Promise<void> {
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

export function createPeerReviewControllerActions<
  StoreState extends PeerReviewState,
>(
  set: SetState<StoreState>,
  get: GetState<StoreState>,
): Pick<PeerReviewActions, "loadSharedContent" | "syncPeerComments"> {
  return {
    loadSharedContent: async () => {
      await loadPeerSharedContent(get, set);
    },
    syncPeerComments: async () => {
      await syncUnsubmittedPeerComments(get);
    },
  };
}
