import type { StoreApi } from "zustand";
import { insertComment as insertCommentService, parseCriticMarkup } from "../../markup";
import { WORKER_URL } from "../../config";
import {
  base64urlToKey,
  docIdFromKey,
  generateKey,
  keyToBase64url,
} from "../../services/crypto";
import { readFile } from "../../services/fileSystem";
import type { FileTreeNode } from "../../types/fileTree";
import type { ShareRecord } from "../../types/share";
import type { TabState } from "../../types/tab";
import { buildShareUrlFromOrigin } from "../../utils/shareUrl";
import { writeAndUpdate } from "../host-review";
import {
  ensureRelaySubscriptions,
  relayCommentResolve,
  unsubscribeFromDoc,
} from "../relay";
import { removePendingCommentState, replacePendingCommentsState } from "./state";
import { ShareStorage } from "./storage";
import type {
  ShareContentOptions,
  SharingActions,
} from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];
type GetState<StoreState> = StoreApi<StoreState>["getState"];

const SHARES_KEY = "markreview-shares";

interface SharingControllerStoreState {
  tabs: TabState[];
  activeTabId: string | null;
}

interface SharingControllerDeps<StoreState extends SharingControllerStoreState> {
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

function isShareRecordMap(
  value: unknown,
): value is Record<string, ShareRecord[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => Array.isArray(entry));
}

function loadAllShares(): Record<string, ShareRecord[]> {
  try {
    const raw = localStorage.getItem(SHARES_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (isShareRecordMap(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

function saveAllShares(allShares: Record<string, ShareRecord[]>) {
  localStorage.setItem(SHARES_KEY, JSON.stringify(allShares));
}

export function stableShareKey(tab: {
  directoryName: string | null;
  fileName: string | null;
  id: string;
}): string {
  return tab.directoryName ?? tab.fileName ?? tab.id;
}

export function saveShares(key: string, shares: ShareRecord[]) {
  const allShares = loadAllShares();
  allShares[key] = shares;
  saveAllShares(allShares);
}

export function loadAndCleanShares(tabs: {
  id: string;
  directoryName: string | null;
  fileName: string | null;
}[]): Record<string, ShareRecord[]> {
  const allShares = loadAllShares();
  let changed = false;

  for (const tab of tabs) {
    const stableKey = stableShareKey(tab);
    if (tab.id === stableKey) {
      continue;
    }
    const oldShares = allShares[tab.id];
    if (!oldShares || oldShares.length === 0) {
      continue;
    }
    const existingShares = allShares[stableKey] ?? [];
    const existingDocIds = new Set(existingShares.map((share) => share.docId));
    const mergedShares = [
      ...existingShares,
      ...oldShares.filter((share) => !existingDocIds.has(share.docId)),
    ];
    allShares[stableKey] = mergedShares;
    delete allShares[tab.id];
    changed = true;
  }

  const now = new Date();
  for (const key of Object.keys(allShares)) {
    const liveShares = allShares[key].filter(
      (share) => new Date(share.expiresAt) > now,
    );
    if (liveShares.length !== allShares[key].length) {
      changed = true;
    }
    if (liveShares.length === 0) {
      delete allShares[key];
    } else {
      allShares[key] = liveShares;
    }
  }

  if (changed) {
    saveAllShares(allShares);
  }
  return allShares;
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
    } catch {
      console.warn("[sharing] skipping share with invalid key:", share.docId);
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

function buildShareRecord(
  input: {
    docId: string;
    hostSecret: string;
    keyB64: string;
    label: string;
    ttl: number;
    tree: Record<string, string>;
  },
): ShareRecord {
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
  const label = options.label ?? tab.directoryName ?? tab.fileName ?? "document";
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

  const key = await generateKey();
  const docId = await docIdFromKey(key);
  const { hostSecret } = await storage.uploadContent(docId, tree, key, {
    ttl: options.ttl,
    label,
  });
  const keyB64 = await keyToBase64url(key);
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
  return (
    tabs.find((tab) => tab.shares.some((share) => share.docId === docId)) ?? null
  );
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
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, (tabState) => ({
          shareKeys: { ...tabState.shareKeys, ...restoredKeys },
        })),
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

      const currentTab = get().tabs.find((currentTab) => currentTab.id === tabId);
      if (!currentTab) {
        throw new Error("Tab disappeared");
      }

      const shares = [...currentTab.shares, record];
      saveShares(stableShareKey(currentTab), shares);
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
      saveShares(stableShareKey(tab), updatedShares);
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
      const tab = getActiveTab(get);
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
        return;
      }

      const currentPath = tab.activeFilePath ?? tab.fileName ?? "";
      if (comment.path !== currentPath) {
        console.error("[mergeComment] path mismatch", {
          commentPath: comment.path,
          currentPath,
        });
        return;
      }

      const readPermission = await tab.fileHandle.queryPermission({
        mode: "read",
      });
      const writePermission = await tab.fileHandle.queryPermission({
        mode: "readwrite",
      });
      console.log("[mergeComment] proceeding", {
        tabId: tab.id,
        fileName: tab.fileName,
        activeFilePath: tab.activeFilePath,
        readPermission,
        writePermission,
        commentPath: comment.path,
        blockIndex: comment.blockRef.blockIndex,
      });

      const { cleanMarkdown } = parseCriticMarkup(tab.rawContent);
      const attribution = ` — ${comment.peerName}`;
      const newRaw = insertCommentService(
        tab.rawContent,
        tab.comments,
        cleanMarkdown,
        comment.blockRef.blockIndex,
        comment.commentType,
        comment.text + attribution,
      );
      if (newRaw === tab.rawContent) {
        console.error("[mergeComment] insert had no effect", {
          blockIndex: comment.blockRef.blockIndex,
          commentType: comment.commentType,
          contentLength: tab.rawContent.length,
        });
      }

      const writeSucceeded = await writeAndUpdate({
        set,
        buildUpdatedActiveTabs,
        fileHandle: tab.fileHandle,
        newRawContent: newRaw,
      });
      if (!writeSucceeded) {
        return;
      }

      const latestTab = getActiveTab(get);
      if (!latestTab) {
        return;
      }

      const nextTabState = removePendingCommentState(latestTab, docId, comment.id);
      saveShares(stableShareKey(latestTab), nextTabState.shares);
      updateSharingTabState({
        set,
        buildUpdatedTabs,
        tabId: latestTab.id,
        updater: () => nextTabState,
      });
      queuePendingResolve(docId, comment.id);
      flushPendingCommentResolvesForDoc(get().tabs, docId);
    },

    dismissComment: (docId, cmtId) => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }

      const nextTabState = removePendingCommentState(tab, docId, cmtId);
      saveShares(stableShareKey(tab), nextTabState.shares);
      updateSharingTabState({
        set,
        buildUpdatedTabs,
        tabId: tab.id,
        updater: () => nextTabState,
      });
      queuePendingResolve(docId, cmtId);
      flushPendingCommentResolvesForDoc(get().tabs, docId);
    },

    clearPendingComments: (docId) => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }

      const pendingForDoc = tab.pendingComments[docId] ?? [];
      const clearedIds = pendingForDoc.map((comment) => comment.id);
      const nextTabState = replacePendingCommentsState(tab, docId, []);
      saveShares(stableShareKey(tab), nextTabState.shares);
      updateSharingTabState({
        set,
        buildUpdatedTabs,
        tabId: tab.id,
        updater: () => nextTabState,
      });

      for (const clearedId of clearedIds) {
        queuePendingResolve(docId, clearedId);
      }
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
      saveShares(stableShareKey(targetTab), nextTabState.shares);
      updateSharingTabState({
        set,
        buildUpdatedTabs,
        tabId: targetTab.id,
        updater: () => nextTabState,
      });
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
      saveShares(stableShareKey(targetTab), nextTabState.shares);
      updateSharingTabState({
        set,
        buildUpdatedTabs,
        tabId: targetTab.id,
        updater: () => nextTabState,
      });
    },

    flushPendingCommentResolves: (docId) => {
      flushPendingCommentResolvesForDoc(get().tabs, docId);
    },
  };
}
