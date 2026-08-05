import type { StoreApi } from "zustand";
import {
  getBlockPlainTextMap,
  insertComment as insertCommentService,
  parseMarkdownFrontmatter,
  parseCriticMarkup,
  resolveCommentAnchor,
} from "../../markup";
import { WORKER_URL } from "../../config";
import { base64urlToKey } from "../../services/crypto";
import { readFile } from "../../runtime";
import type { FileTreeNode } from "../../types/fileTree";
import type { PeerComment, ShareRecord } from "../../types/share";
import type { TabState } from "../../types/tab";
import { buildShareUrlFromOrigin } from "../../utils/shareUrl";
import { writeAndUpdateTab } from "../host-review";
import {
  ensureRelaySubscriptions,
  relayCommentResolve,
  unsubscribeFromDoc,
} from "../relay";
import {
  removePendingCommentState,
  replacePendingCommentsState,
} from "./state";
import { ShareStorage } from "./storage";
import { prepareShareIdentity } from "./shareIdentity";
import { saveShares } from "./registry";
import type { ShareContentOptions, SharingActions } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];
type GetState<StoreState> = StoreApi<StoreState>["getState"];

interface SharingControllerStoreState {
  tabs: TabState[];
  activeTabId: string | null;
}

interface SharingControllerDeps<
  StoreState extends SharingControllerStoreState,
> {
  set: SetState<StoreState>;
  get: GetState<StoreState>;
  queuePendingResolve: (docId: string, cmtId: string) => void;
  getActiveTab: (get: () => StoreState) => TabState | null;
  buildUpdatedTabs: (
    tabs: TabState[],
    tabId: string,
    updater: (tab: TabState) => Partial<TabState>,
  ) => TabState[];
  buildUpdatedActiveTabs: (
    tabs: TabState[],
    activeTabId: string | null,
    updater: (tab: TabState) => Partial<TabState>,
  ) => TabState[];
  getLiveFileTree: (tab: TabState) => FileTreeNode[];
}

export async function collectTreeContents(
  nodes: FileTreeNode[],
  activeFilePath: string | null,
  rawContent: string,
  allowedPaths?: Set<string> | null,
): Promise<Record<string, string>> {
  const tree: Record<string, string> = {};

  async function walk(items: FileTreeNode[]): Promise<void> {
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
          } catch (error) {
            console.warn(
              "[collectTreeContents] skipping unreadable file:",
              path,
              error,
            );
          }
        }
      } else {
        await walk(node.children);
      }
    }
  }

  await walk(nodes);
  return tree;
}

export async function restoreShareKeys(
  shares: ShareRecord[],
): Promise<Record<string, CryptoKey>> {
  const keys: Record<string, CryptoKey> = {};
  const now = new Date();

  for (const share of shares) {
    if (new Date(share.expiresAt) <= now) {
      continue;
    }
    try {
      keys[share.docId] = await base64urlToKey(share.keyB64);
    } catch (error) {
      console.warn(
        "[sharing] skipping share with invalid key:",
        share.docId,
        error,
      );
    }
  }

  return keys;
}

export function getSharingStorage(): ShareStorage | null {
  if (!WORKER_URL) {
    return null;
  }
  return new ShareStorage(WORKER_URL);
}

function buildShareRecord(input: {
  docId: string;
  hostSecret: string;
  keyB64: string;
  label: string;
  ttl: number;
  tree: Record<string, string>;
}): ShareRecord {
  const now = new Date();
  return {
    docId: input.docId,
    hostSecret: input.hostSecret,
    label: input.label,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttl * 1000).toISOString(),
    pendingCommentCount: 0,
    keyB64: input.keyB64,
    fileCount: Object.keys(input.tree).length,
    sharedPaths: Object.keys(input.tree),
  };
}

async function createShare(
  storage: ShareStorage,
  tab: TabState,
  options: ShareContentOptions,
  getLiveFileTree: (tab: TabState) => FileTreeNode[],
): Promise<{
  docId: string;
  key: CryptoKey;
  record: ShareRecord;
  shareUrl: string;
}> {
  const label =
    options.label ?? tab.directoryName ?? tab.fileName ?? "document";
  const liveFileTree = getLiveFileTree(tab);
  const sourceNodes =
    options.nodes ??
    (tab.directoryName && liveFileTree.length > 0 ? liveFileTree : null);
  const tree = sourceNodes
    ? await collectTreeContents(sourceNodes, tab.activeFilePath, tab.rawContent)
    : {};

  if (Object.keys(tree).length === 0 && tab.rawContent) {
    const path = tab.activeFilePath ?? tab.fileName ?? "document.md";
    tree[path] = tab.rawContent;
  }

  const identity = options.preparedIdentity ?? (await prepareShareIdentity());
  const { docId, key, keyB64 } = identity;
  const { hostSecret } = await storage.uploadContent(docId, tree, key, {
    ttl: options.ttl,
    label,
  });
  const record = buildShareRecord({
    docId,
    hostSecret,
    label,
    ttl: options.ttl,
    keyB64,
    tree,
  });

  return {
    docId,
    key,
    record,
    shareUrl: buildShareUrlFromOrigin({ keyB64, name: label }),
  };
}

function findSharingTabByDocId(
  tabs: TabState[],
  docId: string,
): TabState | null {
  const owners = tabs.filter((tab) =>
    tab.shares.some((share) => share.docId === docId),
  );
  if (owners.length !== 1) {
    if (owners.length > 1) {
      console.warn("[sharing] share owner is ambiguous", {
        docId,
        ownerWorkspaceIds: owners.map((tab) => tab.workspaceId),
      });
    }
    return null;
  }
  return owners[0];
}

type UpdateSharingTabStateOptions<StoreState extends { tabs: TabState[] }> = {
  set: SetState<StoreState>;
  buildUpdatedTabs: (
    tabs: TabState[],
    tabId: string,
    updater: (tab: TabState) => Partial<TabState>,
  ) => TabState[];
  tabId: string;
  updater: (tab: TabState) => Partial<TabState>;
};

function updateSharingTabState<StoreState extends { tabs: TabState[] }>(
  options: UpdateSharingTabStateOptions<StoreState>,
) {
  const { set, buildUpdatedTabs, tabId, updater } = options;
  set((state) => ({
    tabs: buildUpdatedTabs(state.tabs, tabId, updater),
  }));
}

function flushPendingCommentResolvesForDoc(
  tabs: TabState[],
  docId: string,
): void {
  const targetTab = findSharingTabByDocId(tabs, docId);
  if (!targetTab) {
    return;
  }

  const queuedIds = targetTab.pendingResolveCommentIds[docId] ?? [];
  for (const queuedId of queuedIds) {
    relayCommentResolve(docId, queuedId);
  }
}

export function buildMergedPeerCommentContent(
  rawContent: string,
  comment: PeerComment,
): string {
  const document = parseMarkdownFrontmatter(rawContent);
  const parsed = parseCriticMarkup(document.body);
  const blockMap = getBlockPlainTextMap(
    parsed.cleanMarkdown,
    comment.blockRef.blockIndex,
  );
  if (!blockMap) {
    throw new Error("The commented block no longer exists");
  }
  const stableCommentId = `mr-peer-${comment.id}`;
  if (
    parsed.comments.some(
      (existingComment) =>
        existingComment.thread?.commentId === stableCommentId,
    )
  ) {
    return rawContent;
  }
  const peerAnchor =
    comment.blockRef.quote && comment.blockRef.occurrence
      ? resolveCommentAnchor(blockMap.plainText, {
          quote: comment.blockRef.quote,
          occurrence: comment.blockRef.occurrence,
        })
      : undefined;
  if (peerAnchor?.orphaned) {
    throw new Error("The selected text changed since this comment was sent");
  }
  if (
    !peerAnchor &&
    comment.blockRef.contentPreview &&
    !blockMap.plainText.startsWith(comment.blockRef.contentPreview)
  ) {
    throw new Error("The commented block changed since this comment was sent");
  }
  const newBody = insertCommentService({
    rawContent: document.body,
    existingComments: parsed.comments,
    cleanMarkdown: parsed.cleanMarkdown,
    blockIndex: comment.blockRef.blockIndex,
    type: comment.commentType,
    text: comment.text,
    authorLabel: comment.peerName,
    stableCommentId,
    anchor: peerAnchor,
  });
  const nextRawContent = rawContent.slice(0, document.bodyStart) + newBody;
  if (nextRawContent === rawContent) {
    throw new Error("The comment could not be inserted safely");
  }
  return nextRawContent;
}

async function hashContent(content: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isDeterministicallyMerged(
  rawContent: string,
  comment: PeerComment,
): boolean {
  const document = parseMarkdownFrontmatter(rawContent);
  const parsed = parseCriticMarkup(document.body);
  const stableCommentId = `mr-peer-${comment.id}`;
  return parsed.comments.some(
    (existingComment) => existingComment.thread?.commentId === stableCommentId,
  );
}

export function createSharingControllerActions<
  StoreState extends SharingControllerStoreState,
>(
  deps: SharingControllerDeps<StoreState>,
): Pick<
  SharingActions,
  | "restoreShareSessions"
  | "shareContent"
  | "revokeShare"
  | "mergeComment"
  | "dismissComment"
  | "clearPendingComments"
  | "addPendingComment"
  | "replaceCommentsSnapshot"
  | "flushPendingCommentResolves"
> {
  const {
    set,
    get,
    queuePendingResolve,
    getActiveTab,
    buildUpdatedTabs,
    buildUpdatedActiveTabs,
    getLiveFileTree,
  } = deps;

  return {
    restoreShareSessions: async () => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }

      const restoredKeys = await restoreShareKeys(tab.shares);
      if (Object.keys(restoredKeys).length === 0) {
        return;
      }

      set((state) => ({
        tabs: buildUpdatedActiveTabs(
          state.tabs,
          state.activeTabId,
          (tabState) => ({
            shareKeys: { ...tabState.shareKeys, ...restoredKeys },
          }),
        ),
      }));
    },

    shareContent: async (options) => {
      const storage = getSharingStorage();
      if (!storage) {
        throw new Error("Worker URL not configured");
      }
      const tab = getActiveTab(get);
      if (!tab) {
        throw new Error("No active tab");
      }

      const tabId = tab.id;
      const { docId, key, record, shareUrl } = await createShare(
        storage,
        tab,
        options,
        getLiveFileTree,
      );

      const currentTab = get().tabs.find(
        (currentTab) => currentTab.id === tabId,
      );
      if (!currentTab) {
        throw new Error("Tab disappeared");
      }

      const shares = [...currentTab.shares, record];
      if (!saveShares(currentTab.workspaceId, shares)) {
        try {
          await storage.deleteContent(docId, record.hostSecret);
        } catch (cleanupError) {
          console.warn(
            "[sharing] failed to revoke an unpersisted share:",
            cleanupError,
          );
        }
        throw new Error(
          "The share could not be saved in this browser. No review link was created.",
        );
      }
      updateSharingTabState({
        set,
        buildUpdatedTabs,
        tabId,
        updater: (tabState) => ({
          shares,
          shareKeys: { ...tabState.shareKeys, [docId]: key },
          activeDocId: docId,
        }),
      });

      ensureRelaySubscriptions([record]);
      return shareUrl;
    },

    revokeShare: async (docId) => {
      const storage = getSharingStorage();
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }
      const record = tab.shares.find((share) => share.docId === docId);
      if (!record) {
        return;
      }

      try {
        await storage?.deleteContent(docId, record.hostSecret);
      } catch (error) {
        console.error("[revokeShare] failed to delete content:", docId, error);
      }

      const updatedShares = tab.shares.filter((share) => share.docId !== docId);
      saveShares(tab.workspaceId, updatedShares);
      updateSharingTabState({
        set,
        buildUpdatedTabs,
        tabId: tab.id,
        updater: (tabState) => {
          const nextPendingComments = { ...tabState.pendingComments };
          delete nextPendingComments[docId];
          const nextShareKeys = { ...tabState.shareKeys };
          delete nextShareKeys[docId];
          const nextPendingResolveIds = {
            ...tabState.pendingResolveCommentIds,
          };
          delete nextPendingResolveIds[docId];

          return {
            shares: updatedShares,
            pendingComments: nextPendingComments,
            pendingResolveCommentIds: nextPendingResolveIds,
            shareKeys: nextShareKeys,
            activeDocId:
              tabState.activeDocId === docId ? null : tabState.activeDocId,
          };
        },
      });

      unsubscribeFromDoc(docId);
    },

    mergeComment: async (docId, comment) => {
      const tab = findSharingTabByDocId(get().tabs, docId);
      if (!tab?.fileHandle) {
        console.error("[mergeComment] no active tab or fileHandle", {
          hasTab: !!tab,
          hasHandle: !!tab?.fileHandle,
          tabId: tab?.id,
          activeTabId: get().activeTabId,
          tabFileName: tab?.fileName,
          allTabs: get().tabs.map((currentTab) => ({
            id: currentTab.id,
            fileName: currentTab.fileName,
            hasHandle: !!currentTab.fileHandle,
          })),
        });
        return false;
      }

      const currentPath = tab.activeFilePath ?? tab.fileName ?? "";
      if (comment.path !== currentPath) {
        console.error("[mergeComment] path mismatch", {
          commentPath: comment.path,
          currentPath,
        });
        return false;
      }
      const ownerTabId = tab.id;
      const expectedFileHandle = tab.fileHandle;
      const expectedPath = currentPath;
      const expectedRawContent = tab.rawContent;

      try {
        const [expectedHash, liveRawContent] = await Promise.all([
          hashContent(expectedRawContent),
          readFile(expectedFileHandle),
        ]);
        const liveHash = await hashContent(liveRawContent);
        const currentOwner = get().tabs.find(
          (candidate) => candidate.id === ownerTabId,
        );
        const ownerStillMatches =
          currentOwner?.fileHandle === expectedFileHandle &&
          (currentOwner.activeFilePath ?? currentOwner.fileName ?? "") ===
            expectedPath;
        if (!ownerStillMatches || liveHash !== expectedHash) {
          console.warn("[mergeComment] document changed before merge", {
            docId,
            cmtId: comment.id,
            ownerTabId,
          });
          return false;
        }

        const alreadyMerged = isDeterministicallyMerged(
          liveRawContent,
          comment,
        );
        const newRawContent = alreadyMerged
          ? liveRawContent
          : buildMergedPeerCommentContent(liveRawContent, comment);
        if (!alreadyMerged) {
          const writeSucceeded = await writeAndUpdateTab({
            set,
            buildUpdatedTabs,
            tabId: ownerTabId,
            fileHandle: expectedFileHandle,
            expectedRawContent,
            newRawContent,
          });
          if (!writeSucceeded) {
            return false;
          }
        }

        if (!queuePendingResolve(docId, comment.id)) {
          console.warn("[mergeComment] resolve outbox is unavailable", {
            docId,
            cmtId: comment.id,
          });
          return false;
        }

        const latestOwner = get().tabs.find(
          (candidate) => candidate.id === ownerTabId,
        );
        if (!latestOwner) {
          return false;
        }
        const nextTabState = removePendingCommentState(
          latestOwner,
          docId,
          comment.id,
        );
        saveShares(latestOwner.workspaceId, nextTabState.shares);
        updateSharingTabState({
          set,
          buildUpdatedTabs,
          tabId: ownerTabId,
          updater: () => nextTabState,
        });
        flushPendingCommentResolvesForDoc(get().tabs, docId);
        return true;
      } catch (error) {
        console.warn("[mergeComment] merge rejected:", error);
        return false;
      }
    },

    dismissComment: (docId, cmtId) => {
      const tab = findSharingTabByDocId(get().tabs, docId);
      if (!tab) {
        return;
      }

      if (!queuePendingResolve(docId, cmtId)) {
        return;
      }

      const queuedTab = get().tabs.find((candidate) => candidate.id === tab.id);
      if (!queuedTab) {
        return;
      }
      const nextTabState = removePendingCommentState(queuedTab, docId, cmtId);
      saveShares(tab.workspaceId, nextTabState.shares);
      updateSharingTabState({
        set,
        buildUpdatedTabs,
        tabId: tab.id,
        updater: () => nextTabState,
      });
      flushPendingCommentResolvesForDoc(get().tabs, docId);
    },

    clearPendingComments: (docId) => {
      const tab = findSharingTabByDocId(get().tabs, docId);
      if (!tab) {
        return;
      }

      const pendingForDoc = tab.pendingComments[docId] ?? [];
      const clearedIds = pendingForDoc.map((comment) => comment.id);
      const allQueued = clearedIds.every((clearedId) =>
        queuePendingResolve(docId, clearedId),
      );
      if (!allQueued) {
        return;
      }
      const queuedTab = get().tabs.find((candidate) => candidate.id === tab.id);
      if (!queuedTab) {
        return;
      }
      const nextTabState = replacePendingCommentsState(queuedTab, docId, []);
      saveShares(tab.workspaceId, nextTabState.shares);
      updateSharingTabState({
        set,
        buildUpdatedTabs,
        tabId: tab.id,
        updater: () => nextTabState,
      });

      flushPendingCommentResolvesForDoc(get().tabs, docId);
    },

    addPendingComment: (docId, comment) => {
      const targetTab = findSharingTabByDocId(get().tabs, docId);
      if (!targetTab) {
        return;
      }

      const queuedResolveIds = targetTab.pendingResolveCommentIds[docId] ?? [];
      if (queuedResolveIds.includes(comment.id)) {
        return;
      }

      const existingComments = targetTab.pendingComments[docId] ?? [];
      if (existingComments.some((pending) => pending.id === comment.id)) {
        return;
      }

      const nextTabState = replacePendingCommentsState(targetTab, docId, [
        ...existingComments,
        comment,
      ]);
      updateSharingTabState({
        set,
        buildUpdatedTabs,
        tabId: targetTab.id,
        updater: () => nextTabState,
      });
      saveShares(targetTab.workspaceId, nextTabState.shares);
    },

    replaceCommentsSnapshot: (docId, comments) => {
      const targetTab = findSharingTabByDocId(get().tabs, docId);
      if (!targetTab) {
        return;
      }

      const queuedResolveIds = targetTab.pendingResolveCommentIds[docId] ?? [];
      const filteredComments = comments.filter(
        (comment) => !queuedResolveIds.includes(comment.id),
      );
      const nextTabState = replacePendingCommentsState(
        targetTab,
        docId,
        filteredComments,
      );
      updateSharingTabState({
        set,
        buildUpdatedTabs,
        tabId: targetTab.id,
        updater: () => nextTabState,
      });
      saveShares(targetTab.workspaceId, nextTabState.shares);
    },

    flushPendingCommentResolves: (docId) => {
      flushPendingCommentResolvesForDoc(get().tabs, docId);
    },
  };
}
