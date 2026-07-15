import type {
  PreparedShareIdentity,
  ShareContentOptions,
} from "../../../modules/sharing/types";
import type { FileTreeNode } from "../../../types/fileTree";
import type { ShareRecord } from "../../../types/share";

export const TTL_OPTIONS = [
  { label: "1 day", value: 86400 },
  { label: "7 days", value: 604800 },
  { label: "30 days", value: 2592000 },
];
export const EMPTY_SHARES: ShareRecord[] = [];

export type ShareDialogScope =
  | { kind: "current-file"; label?: string }
  | { kind: "current-folder"; label?: string; entityPath: string }
  | { kind: "nodes"; label?: string; nodes: FileTreeNode[] };

export function buildShareOptions(
  ttl: number,
  scope: ShareDialogScope | undefined,
  preparedIdentity?: PreparedShareIdentity,
): ShareContentOptions {
  const options: ShareContentOptions = { ttl, preparedIdentity };
  if (scope?.label) {
    options.label = scope.label;
  }
  if (scope?.kind === "nodes") {
    options.nodes = scope.nodes;
  }
  if (scope?.kind === "current-file") {
    options.nodes = [];
  }
  return options;
}

function collectFilePaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      paths.push(node.path);
    } else {
      paths.push(...collectFilePaths(node.children));
    }
  }
  return paths;
}

function commonPathPrefix(paths: string[]): string {
  if (paths.length === 0) {
    return "";
  }
  let prefix = paths[0];
  for (const path of paths.slice(1)) {
    while (prefix.length > 0 && !path.startsWith(prefix)) {
      const lastSlash = prefix.lastIndexOf("/");
      prefix = lastSlash >= 0 ? prefix.slice(0, lastSlash + 1) : "";
    }
  }
  return prefix;
}

export function entityPathFromScope(
  scope: ShareDialogScope | undefined,
  activeFilePath: string | null,
): string {
  if (scope?.kind === "nodes") {
    const paths = collectFilePaths(scope.nodes);
    return paths.length > 0 ? commonPathPrefix(paths) : (activeFilePath ?? "");
  }
  if (scope?.kind === "current-folder") {
    return scope.entityPath;
  }
  return activeFilePath ?? "";
}

export function isExistingShareMatch(input: {
  share: ShareRecord;
  scope: ShareDialogScope | undefined;
  label: string;
  entityPath: string;
}): boolean {
  const recordPath = input.share.sharedPaths?.length
    ? commonPathPrefix(input.share.sharedPaths)
    : null;
  if (input.scope?.kind === "current-folder") {
    return (
      input.share.label === input.label || recordPath === input.scope.entityPath
    );
  }
  return recordPath === null
    ? input.share.label === input.label
    : recordPath === input.entityPath;
}

export function formatExpiry(expiresAt: string): string {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) {
    return "expired";
  }
  const remainingDays = Math.floor(remainingMs / 86400000);
  const remainingHours = Math.ceil(remainingMs / 3600000);
  return remainingDays > 0
    ? `expires in ${remainingDays} d`
    : `expires in ${remainingHours} h`;
}

export function formatCreated(createdAt: string): string {
  const created = new Date(createdAt);
  const today = new Date();
  if (created.toDateString() === today.toDateString()) {
    return "created today";
  }
  const day = String(created.getDate()).padStart(2, "0");
  const month = String(created.getMonth() + 1).padStart(2, "0");
  return `created ${day}.${month}.${created.getFullYear()}`;
}

export function countFiles(nodes: FileTreeNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + (node.kind === "file" ? 1 : countFiles(node.children)),
    0,
  );
}
