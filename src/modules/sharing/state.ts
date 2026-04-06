import type { StoreApi } from "zustand";
import { parseCriticMarkup } from "../../services/criticmarkup";
import { insertComment as insertCommentService } from "../../services/insertComment";
import {
  docIdFromKey,
  generateKey,
  keyToBase64url,
} from "../../services/crypto";
import {
  ensureRelaySubscriptions,
  relayCommentResolve,
  unsubscribeFromDoc,
} from "../../services/relay";
import { buildShareUrlFromOrigin } from "../../utils/shareUrl";
import type { FileTreeNode } from "../../types/fileTree";
import type { CommentType } from "../../types/criticmarkup";
import type { PeerComment, ShareRecord } from "../../types/share";
import type { TabState } from "../../types/tab";
import {
  collectTreeContents,
  getSharingStorage,
  restoreShareKeys,
  saveShares,
  stableShareKey,
} from "./controller";
import type {
  ShareContentOptions,
  SharingActions,
  SharingTabState,
} from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];
type GetState<StoreState> = StoreApi<StoreState>["getState"];

export function removePendingCommentState(
  tab: TabState,
  docId: string,
  cmtId: string,
): Pick<SharingTabState, "pendingComments" | "shares"> {
  const nextPendingComments = { ...tab.pendingComments };
  const remainingComments = (nextPendingComments[docId] ?? []).filter(
    (comment) => comment.id !== cmtId,
  );
  if (remainingComments.length > 0) {
    nextPendingComments[docId] = remainingComments;
  } else {
    delete nextPendingComments[docId];
  }
  const nextShares = tab.shares.map((share) =>
    share.docId === docId
      ? { ...share, pendingCommentCount: remainingComments.length }
      : share,
  );
  return {
    pendingComments: nextPendingComments,
    shares: nextShares,
  };
}

export function replacePendingCommentsState(
  tab: TabState,
  docId: string,
  comments: PeerComment[],
): Pick<SharingTabState, "pendingComments" | "shares"> {
  const nextPendingComments = { ...tab.pendingComments };
  if (comments.length > 0) {
    nextPendingComments[docId] = comments;
  } else {
    delete nextPendingComments[docId];
  }
  const nextShares = tab.shares.map((share) =>
    share.docId === docId
      ? { ...share, pendingCommentCount: comments.length }
      : share,
  );
  return {
    pendingComments: nextPendingComments,
    shares: nextShares,
  };
}

export function mergeQueuedCommentIds(
  existingIds: string[],
  incomingIds: string[],
): string[] {
  const mergedIds = [...existingIds];
  for (const incomingId of incomingIds) {
    if (!mergedIds.includes(incomingId)) {
      mergedIds.push(incomingId);
    }
  }
  return mergedIds;
}

interface SharingStoreState {
  tabs: TabState[];
  activeTabId: string | null;
  queuePendingResolve: (docId: string, cmtId: string) => void;
  flushPendingCommentResolves: (docId: string) => void;
}

interface SharingActionDeps<StoreState extends SharingStoreState> {
  set: SetState<StoreState>;
  get: GetState<StoreState>;
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
  writeAndUpdate: (
    get: () => StoreState,
    set: SetState<StoreState>,
    fileHandle: FileSystemFileHandle,
    newRaw: string,
  ) => Promise<boolean>;
}

function buildShareRecord(
  docId: string,
  hostSecret: string,
  label: string,
  ttl: number,
  keyB64: string,
  tree: Record<string, string>,
): ShareRecord {
  const now = new Date();
  return {
    docId,
    hostSecret,
    label,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    pendingCommentCount: 0,
    keyB64,
    fileCount: Object.keys(tree).length,
    sharedPaths: Object.keys(tree),
  };
}

async function createShare(
  storage: NonNullable<ReturnType<typeof getSharingStorage>>,
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
  const record = buildShareRecord(
    docId,
    hostSecret,
    label,
    options.ttl,
    keyB64,
    tree,
  );

  return {
    docId,
    key,
    record,
    shareUrl: buildShareUrlFromOrigin({ keyB64, name: label }),
  };
}

export function createSharingActions<StoreState extends SharingStoreState>(
  deps: SharingActionDeps<StoreState>,
): SharingActions {
  const {
    set,
    get,
    getActiveTab,
    buildUpdatedTabs,
    buildUpdatedActiveTabs,
    getLiveFileTree,
    writeAndUpdate,
  } = deps;

  return {
    restoreShareSessions: async () => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }
      const restoredKeys = await restoreShareKeys(tab.shares);
      if (Object.keys(restoredKeys).length > 0) {
        set((state) => ({
          tabs: buildUpdatedActiveTabs(
            state.tabs,
            state.activeTabId,
            (tabState) => ({
              shareKeys: { ...tabState.shareKeys, ...restoredKeys },
            }),
          ),
        }));
      }
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
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, tabId, (tabState) => ({
          shares,
          shareKeys: { ...tabState.shareKeys, [docId]: key },
          activeDocId: docId,
        })),
      }));

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
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, tab.id, (tabState) => {
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
        }),
      }));

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

      const writeSucceeded = await writeAndUpdate(
        get,
        set,
        tab.fileHandle,
        newRaw,
      );
      if (!writeSucceeded) {
        return;
      }

      const latestTab = getActiveTab(get);
      if (!latestTab) {
        return;
      }
      const nextTabState = removePendingCommentState(
        latestTab,
        docId,
        comment.id,
      );
      saveShares(stableShareKey(latestTab), nextTabState.shares);
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, latestTab.id, () => nextTabState),
      }));
      get().queuePendingResolve(docId, comment.id);
      get().flushPendingCommentResolves(docId);
    },

    dismissComment: (docId, cmtId) => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }
      const nextTabState = removePendingCommentState(tab, docId, cmtId);
      saveShares(stableShareKey(tab), nextTabState.shares);
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, tab.id, () => nextTabState),
      }));
      get().queuePendingResolve(docId, cmtId);
      get().flushPendingCommentResolves(docId);
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
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, tab.id, () => nextTabState),
      }));

      for (const clearedId of clearedIds) {
        get().queuePendingResolve(docId, clearedId);
      }
      get().flushPendingCommentResolves(docId);
    },

    toggleSharedPanel: () => {
      set((state) => ({
        tabs: buildUpdatedActiveTabs(
          state.tabs,
          state.activeTabId,
          (tab) => ({
            sharedPanelOpen: !tab.sharedPanelOpen,
            commentPanelOpen: !tab.sharedPanelOpen
              ? false
              : tab.commentPanelOpen,
          }),
        ),
      }));
    },

    addPendingComment: (docId, comment) => {
      const targetTab = get().tabs.find((tab) =>
        tab.shares.some((share) => share.docId === docId),
      );
      if (!targetTab) {
        return;
      }
      const queuedResolveIds =
        targetTab.pendingResolveCommentIds[docId] ?? [];
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
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, targetTab.id, () => nextTabState),
      }));
    },

    replaceCommentsSnapshot: (docId, comments) => {
      const targetTab = get().tabs.find((tab) =>
        tab.shares.some((share) => share.docId === docId),
      );
      if (!targetTab) {
        return;
      }
      const queuedResolveIds =
        targetTab.pendingResolveCommentIds[docId] ?? [];
      const filteredComments = comments.filter(
        (comment) => !queuedResolveIds.includes(comment.id),
      );
      const nextTabState = replacePendingCommentsState(
        targetTab,
        docId,
        filteredComments,
      );
      saveShares(stableShareKey(targetTab), nextTabState.shares);
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, targetTab.id, () => nextTabState),
      }));
    },

    queuePendingResolve: (docId, cmtId) => {
      const targetTab = get().tabs.find((tab) =>
        tab.shares.some((share) => share.docId === docId),
      );
      if (!targetTab) {
        return;
      }
      const existingIds = targetTab.pendingResolveCommentIds[docId] ?? [];
      const nextIds = mergeQueuedCommentIds(existingIds, [cmtId]);
      if (nextIds.length === existingIds.length) {
        return;
      }
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, targetTab.id, (tabState) => ({
          pendingResolveCommentIds: {
            ...tabState.pendingResolveCommentIds,
            [docId]: nextIds,
          },
        })),
      }));
    },

    confirmPendingResolve: (docId, cmtId) => {
      const targetTab = get().tabs.find((tab) =>
        tab.shares.some((share) => share.docId === docId),
      );
      if (!targetTab) {
        return;
      }
      const existingIds = targetTab.pendingResolveCommentIds[docId] ?? [];
      if (!existingIds.includes(cmtId)) {
        return;
      }
      const remainingIds = existingIds.filter(
        (pendingId) => pendingId !== cmtId,
      );
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, targetTab.id, (tabState) => {
          const nextPendingResolveIds = {
            ...tabState.pendingResolveCommentIds,
          };
          if (remainingIds.length > 0) {
            nextPendingResolveIds[docId] = remainingIds;
          } else {
            delete nextPendingResolveIds[docId];
          }
          return {
            pendingResolveCommentIds: nextPendingResolveIds,
          };
        }),
      }));
    },

    flushPendingCommentResolves: (docId) => {
      const targetTab = get().tabs.find((tab) =>
        tab.shares.some((share) => share.docId === docId),
      );
      if (!targetTab) {
        return;
      }
      const queuedIds = targetTab.pendingResolveCommentIds[docId] ?? [];
      for (const queuedId of queuedIds) {
        relayCommentResolve(docId, queuedId);
      }
    },
  };
}
