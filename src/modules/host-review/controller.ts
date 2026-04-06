import type { StoreApi } from "zustand";
import { assignBlockIndices, parseCriticMarkup } from "../../markup";
import { readFile, writeFile } from "../../services/fileSystem";
import type { Comment } from "../../types/criticmarkup";
import type { FileTreeNode } from "../../types/fileTree";
import type { TabState } from "../../types/tab";
import type { FileCommentEntry } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];

interface ActiveTabStoreState {
  tabs: TabState[];
  activeTabId: string | null;
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

export async function writeAndUpdate<StoreState extends ActiveTabStoreState>(
  get: () => StoreState,
  set: SetState<StoreState>,
  buildUpdatedActiveTabs: (
    tabs: TabState[],
    activeTabId: string | null,
    updater: (tab: TabState) => Partial<TabState>,
  ) => TabState[],
  fileHandle: FileSystemFileHandle,
  newRawContent: string,
): Promise<boolean> {
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
          const parsed = parseCriticMarkup(content);
          const comments = assignBlockIndices(
            parsed.comments,
            parsed.cleanMarkdown,
          );
          result[node.path] = {
            filePath: node.path,
            fileName: node.name,
            comments: comments.map((comment) => ({
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
