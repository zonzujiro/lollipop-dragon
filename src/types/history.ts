export interface HistoryEntry {
  id: string;
  type: "file" | "directory";
  name: string;
  stableKey: string;
  workspaceId?: string;
  closedAt: string;
  activeFilePath: string | null;
  hasActiveShares: boolean;
}
