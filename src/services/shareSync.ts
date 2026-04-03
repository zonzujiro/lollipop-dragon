import { useAppStore } from "../store";
import { getActiveTab } from "../store/selectors";
import { toFileTreeNodes } from "../types/fileTree";
import type { FileTreeNode } from "../types/fileTree";
import { readFile } from "./fileSystem";
import { ShareStorage } from "./shareStorage";
import { WORKER_URL } from "../config";

function getStorage(): ShareStorage | null {
  return WORKER_URL ? new ShareStorage(WORKER_URL) : null;
}

async function collectTreeContents(
  nodes: FileTreeNode[],
  activeFilePath: string | null,
  rawContent: string,
  allowedPaths?: Set<string> | null,
): Promise<Record<string, string>> {
  const tree: Record<string, string> = {};
  const walk = async (items: FileTreeNode[]) => {
    for (const node of items) {
      if (node.kind === "file") {
        const path = node.path;
        if (allowedPaths && !allowedPaths.has(path)) {
          continue;
        }
        if (path === activeFilePath && rawContent) {
          tree[path] = rawContent;
        } else {
          try {
            tree[path] = await readFile(node.handle);
          } catch (e) {
            console.warn(
              "[collectTreeContents] skipping unreadable file:",
              path,
              e,
            );
          }
        }
      } else {
        await walk(node.children);
      }
    }
  };
  await walk(nodes);
  return tree;
}

export async function updateShare(docId: string): Promise<void> {
  const storage = getStorage();
  if (!storage) {
    throw new Error("Worker URL not configured");
  }
  const tab = getActiveTab(useAppStore.getState());
  if (!tab) {
    throw new Error("No active tab");
  }
  const record = tab.shares.find((s) => s.docId === docId);
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
    const { rtSocket } = useAppStore.getState();
    if (rtSocket) {
      rtSocket.send(docId, {
        type: "document:updated",
        updatedAt: new Date().toISOString(),
      }).catch((relayError) => {
        console.warn("[relay] document:updated broadcast failed:", relayError);
      });
    }
  } catch (relayError) {
    console.warn("[relay] document:updated broadcast setup failed:", relayError);
  }
}

export async function syncActiveShares(): Promise<void> {
  const state = useAppStore.getState();
  if (state.isPeerMode) {
    return;
  }
  const tab = getActiveTab(state);
  if (!tab) {
    return;
  }
  const now = new Date();
  const active = tab.shares.filter((s) => new Date(s.expiresAt) > now);
  for (const share of active) {
    try {
      await updateShare(share.docId);
    } catch (e) {
      console.warn("[sync] failed to push update for", share.docId, e);
    }
  }
}
