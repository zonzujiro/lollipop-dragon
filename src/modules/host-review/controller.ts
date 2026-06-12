import type { StoreApi } from "zustand";
import {
  applyDelete,
  applyEdit,
  assignBlockIndices,
  insertComment as insertCommentService,
  parseMarkdownFrontmatter,
  parseCriticMarkup,
  shiftCommentRawOffsets,
} from "../../markup";
import { findLiveFileInTree } from "../../types/fileTree";
import type { Comment } from "../../types/criticmarkup";
import type { FileNode, FileTreeNode } from "../../types/fileTree";
import { readFile, writeFile } from "../../runtime";
import type { TabState } from "../../types/tab";
import type { FileCommentEntry, HostReviewActions } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];
type GetState<StoreState> = StoreApi<StoreState>["getState"];

interface ActiveTabStoreState {
  tabs: TabState[];
  activeTabId: string | null;
}

type HostReviewControllerStoreState = ActiveTabStoreState;

interface HostReviewControllerDeps<
  StoreState extends HostReviewControllerStoreState,
> {
  set: SetState<StoreState>;
  get: GetState<StoreState>;
  selectFile: (node: FileNode) => Promise<void>;
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

export function scrollToHostReviewBlock(blockIndex: number | undefined) {
  if (blockIndex === undefined) {
    return;
  }

  const element = document.querySelector(`[data-block-index="${blockIndex}"]`);
  if (!element) {
    console.error(
      `[scrollToBlock] No element found for data-block-index="${blockIndex}"`,
    );
    return;
  }

  element.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function isPermissionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}

export function findResolvedComments(
  comments: Comment[],
  rawContent: string,
): Comment[] {
  return comments.filter((comment) => !rawContent.includes(comment.raw));
}

export async function writeAndUpdate<
  StoreState extends ActiveTabStoreState,
>(input: {
  set: SetState<StoreState>;
  buildUpdatedActiveTabs: (
    tabs: TabState[],
    activeTabId: string | null,
    updater: (tab: TabState) => Partial<TabState>,
  ) => TabState[];
  fileHandle: FileSystemFileHandle;
  newRawContent: string;
}): Promise<boolean> {
  const { set, buildUpdatedActiveTabs, fileHandle, newRawContent } = input;
  try {
    await writeFile(fileHandle, newRawContent);
    set((state) => ({
      tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, (tab) => ({
        rawContent: newRawContent,
        writeAllowed: true,
        undoState: { rawContent: tab.rawContent },
      })),
    }));
    return true;
  } catch (error) {
    if (isPermissionError(error)) {
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          writeAllowed: false,
        })),
      }));
    } else {
      console.error("[writeAndUpdate] write failed:", error);
    }
    return false;
  }
}

export async function scanAllTabFileComments(
  tab: TabState,
  getLiveFileTree: (tab: TabState) => FileTreeNode[],
): Promise<Record<string, FileCommentEntry>> {
  const result: Record<string, FileCommentEntry> = {};

  async function scanNodes(nodes: FileTreeNode[]): Promise<void> {
    for (const node of nodes) {
      if (node.kind === "file") {
        try {
          const content = await readFile(node.handle);
          const document = parseMarkdownFrontmatter(content);
          const parsed = parseCriticMarkup(document.body);
          const comments = assignBlockIndices(
            parsed.comments,
            parsed.cleanMarkdown,
          );
          const commentsWithRawOffsets = shiftCommentRawOffsets(
            comments,
            document.bodyStart,
          );
          result[node.path] = {
            filePath: node.path,
            fileName: node.name,
            comments: commentsWithRawOffsets.map((comment) => ({
              ...comment,
              filePath: node.path,
            })),
          };
        } catch (error) {
          console.warn(
            "[scanAllFileComments] skipping unreadable file:",
            node.path,
            error,
          );
        }
      } else {
        await scanNodes(node.children);
      }
    }
  }

  await scanNodes(getLiveFileTree(tab));
  return result;
}

export function createHostReviewControllerActions<
  StoreState extends HostReviewControllerStoreState,
>(
  deps: HostReviewControllerDeps<StoreState>,
): Pick<
  HostReviewActions,
  | "scanAllFileComments"
  | "navigateToComment"
  | "navigateToBlock"
  | "deleteComment"
  | "deleteAllComments"
  | "editComment"
  | "addComment"
  | "undo"
> {
  const {
    set,
    get,
    selectFile,
    getActiveTab,
    buildUpdatedTabs,
    buildUpdatedActiveTabs,
    getLiveFileTree,
  } = deps;

  return {
    scanAllFileComments: async () => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }

      const scannedComments = await scanAllTabFileComments(
        tab,
        getLiveFileTree,
      );
      const currentTab = get().tabs.find(
        (currentTab) => currentTab.id === tab.id,
      );
      if (!currentTab) {
        return;
      }

      const activePath = currentTab.activeFilePath ?? currentTab.fileName;
      const mergedComments = { ...scannedComments };
      if (activePath && currentTab.allFileComments[activePath]) {
        mergedComments[activePath] = currentTab.allFileComments[activePath];
      }

      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
          allFileComments: mergedComments,
        })),
      }));
    },

    navigateToComment: (filePath, rawStart) => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }

      if (filePath === tab.activeFilePath) {
        const comment = tab.comments.find(
          (candidateComment) => candidateComment.rawStart === rawStart,
        );
        if (!comment) {
          return;
        }

        set((state) => ({
          tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
            activeCommentId: comment.id,
          })),
        }));
        scrollToHostReviewBlock(comment.blockIndex);
        return;
      }

      const fileNode = findLiveFileInTree(tab.fileTree, filePath);
      if (!fileNode) {
        return;
      }

      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          pendingScrollTarget: { filePath, rawStart },
        })),
      }));
      void selectFile(fileNode);
    },

    navigateToBlock: (filePath, blockIndex) => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }

      if (filePath === tab.activeFilePath) {
        scrollToHostReviewBlock(blockIndex);
        return;
      }

      const fileNode = findLiveFileInTree(tab.fileTree, filePath);
      if (!fileNode) {
        return;
      }

      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          pendingScrollTarget: { filePath, blockIndex },
        })),
      }));
      void selectFile(fileNode);
    },

    deleteComment: async (id) => {
      const tab = getActiveTab(get);
      if (!tab?.fileHandle) {
        return;
      }

      const comment = tab.comments.find(
        (candidateComment) => candidateComment.id === id,
      );
      if (!comment) {
        return;
      }

      await writeAndUpdate({
        set,
        buildUpdatedActiveTabs,
        fileHandle: tab.fileHandle,
        newRawContent: applyDelete(tab.rawContent, comment),
      });
    },

    deleteAllComments: async () => {
      const tab = getActiveTab(get);
      if (!tab?.fileHandle || tab.comments.length === 0) {
        return;
      }

      const sortedComments = [...tab.comments].sort(
        (leftComment, rightComment) =>
          rightComment.rawStart - leftComment.rawStart,
      );
      let nextRawContent = tab.rawContent;
      for (const comment of sortedComments) {
        nextRawContent = applyDelete(nextRawContent, comment);
      }

      await writeAndUpdate({
        set,
        buildUpdatedActiveTabs,
        fileHandle: tab.fileHandle,
        newRawContent: nextRawContent,
      });
    },

    editComment: async (id, type, text) => {
      const tab = getActiveTab(get);
      if (!tab?.fileHandle) {
        return;
      }

      const comment = tab.comments.find(
        (candidateComment) => candidateComment.id === id,
      );
      if (!comment) {
        return;
      }

      await writeAndUpdate({
        set,
        buildUpdatedActiveTabs,
        fileHandle: tab.fileHandle,
        newRawContent: applyEdit(tab.rawContent, comment, type, text),
      });
    },

    addComment: async (blockIndex, type, text) => {
      const tab = getActiveTab(get);
      if (!tab?.fileHandle) {
        return;
      }

      const document = parseMarkdownFrontmatter(tab.rawContent);
      const parsed = parseCriticMarkup(document.body);
      const nextBody = insertCommentService({
        rawContent: document.body,
        existingComments: parsed.comments,
        cleanMarkdown: parsed.cleanMarkdown,
        blockIndex,
        type,
        text,
      });
      const nextRawContent =
        tab.rawContent.slice(0, document.bodyStart) + nextBody;

      await writeAndUpdate({
        set,
        buildUpdatedActiveTabs,
        fileHandle: tab.fileHandle,
        newRawContent: nextRawContent,
      });
    },

    undo: async () => {
      const tab = getActiveTab(get);
      if (!tab?.undoState || !tab.fileHandle) {
        return;
      }

      try {
        const restoredRawContent = tab.undoState.rawContent;
        await writeFile(tab.fileHandle, restoredRawContent);
        set((state) => ({
          tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
            rawContent: restoredRawContent,
            undoState: null,
            writeAllowed: true,
          })),
        }));
      } catch (error) {
        if (isPermissionError(error)) {
          set((state) => ({
            tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
              writeAllowed: false,
            })),
          }));
        } else {
          console.error("[undo] write failed:", error);
        }
      }
    },
  };
}
