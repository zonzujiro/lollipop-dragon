import { readFile } from "../../services/fileSystem";
import { base64urlToKey } from "../../services/crypto";
import { WORKER_URL } from "../../config";
import type { FileTreeNode } from "../../types/fileTree";
import type { ShareRecord } from "../../types/share";
import { ShareStorage } from "./storage";

const SHARES_KEY = "markreview-shares";

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
    const existingDocIds = new Set(
      existingShares.map((share) => share.docId),
    );
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
      // skip shares with invalid keys
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
