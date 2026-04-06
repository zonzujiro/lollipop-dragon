import type { HydratedSidebarTreeNode } from "./fileTree";
import {
  createSharingTabState,
  type SharingTabState,
} from "../modules/sharing/types";
import {
  createHostReviewTabState,
  type HostReviewTabState,
} from "../modules/host-review/types";

export type { FileCommentEntry } from "../modules/host-review/types";

export interface TabState extends SharingTabState, HostReviewTabState {
  id: string;
  label: string;

  fileHandle: FileSystemFileHandle | null;
  fileName: string | null;
  rawContent: string;

  directoryHandle: FileSystemDirectoryHandle | null;
  directoryName: string | null;
  fileTree: HydratedSidebarTreeNode[];
  activeFilePath: string | null;
  sidebarOpen: boolean;

  restoreError: string | null;
}

export function createDefaultTab(
  overrides: Partial<TabState> & { label: string },
): TabState {
  return {
    id: crypto.randomUUID(),
    label: overrides.label,
    fileHandle: null,
    fileName: null,
    rawContent: "",
    directoryHandle: null,
    directoryName: null,
    fileTree: [],
    activeFilePath: null,
    sidebarOpen: true,
    ...createHostReviewTabState(),
    ...createSharingTabState(),
    restoreError: null,
    ...overrides,
  };
}
