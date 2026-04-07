import { getRelay } from "../relay";
import { getActiveTab } from "../workspace/helpers";
import { toFileTreeNodes } from "../../types/fileTree";
import type { TabState } from "../../types/tab";
import { collectTreeContents, getSharingStorage } from "./controller";

interface SharingSyncState {
  tabs: TabState[];
  activeTabId: string | null;
  isPeerMode: boolean;
}

export async function updateShare(input: {
  tab: TabState;
  docId: string;
}): Promise<void> {
  const storage = getSharingStorage();
  if (!storage) {
    throw new Error("Worker URL not configured");
  }
  const { tab, docId } = input;
  const record = tab.shares.find((share) => share.docId === docId);
  if (!record) {
    throw new Error("Share not found");
  }
  const key = tab.shareKeys[docId];
  if (!key) {
    throw new Error("Encryption key not available (session may have expired)");
  }

  const allowed = record.sharedPaths ? new Set(record.sharedPaths) : null;
  const liveFileTree = toFileTreeNodes(tab.fileTree);
  const tree =
    liveFileTree.length > 0
      ? await collectTreeContents(
          liveFileTree,
          tab.activeFilePath,
          tab.rawContent,
          allowed,
        )
      : {};
  if (Object.keys(tree).length === 0 && tab.rawContent) {
    const fallbackPath = tab.activeFilePath ?? tab.fileName ?? "document.md";
    if (!allowed || allowed.has(fallbackPath)) {
      tree[fallbackPath] = tab.rawContent;
    }
  }

  await storage.updateContent(docId, record.hostSecret, tree, key);

  try {
    const relay = getRelay();
    if (relay) {
      await relay.send(docId, {
        type: "document:updated",
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.warn("[relay] document:updated broadcast failed:", error);
  }
}

export async function syncActiveShares(
  state: SharingSyncState,
): Promise<void> {
  if (state.isPeerMode) {
    return;
  }
  const tab = getActiveTab(state);
  if (!tab) {
    return;
  }
  const activeShares = tab.shares.filter(
    (share) => new Date(share.expiresAt) > new Date(),
  );
  for (const share of activeShares) {
    try {
      await updateShare({ tab, docId: share.docId });
    } catch (error) {
      console.warn("[syncActiveShares] failed:", share.docId, error);
    }
  }
}
