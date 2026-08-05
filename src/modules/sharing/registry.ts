import { isShareRecordArray } from "../../types/share";
import type { ShareRecord } from "../../types/share";

const LEGACY_SHARES_KEY = "markreview-shares";
const SHARE_REGISTRY_KEY = "markreview-shares-v2";

interface ShareBinding {
  ownerWorkspaceId: string;
  share: ShareRecord;
}

interface ShareRegistry {
  version: 2;
  bindings: Record<string, ShareBinding>;
  unboundLegacy: Record<string, ShareRecord[]>;
}

interface ShareRegistryRead {
  ok: boolean;
  registry: ShareRegistry;
}

interface WorkspaceIdentity {
  id: string;
  workspaceId: string;
  directoryName: string | null;
  fileName: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isShareBinding(value: unknown): value is ShareBinding {
  return (
    isRecord(value) &&
    typeof value["ownerWorkspaceId"] === "string" &&
    "share" in value &&
    isShareRecordArray([value["share"]])
  );
}

function isShareBindingMap(
  value: unknown,
): value is Record<string, ShareBinding> {
  return isRecord(value) && Object.values(value).every(isShareBinding);
}

function isShareRecordMap(
  value: unknown,
): value is Record<string, ShareRecord[]> {
  return isRecord(value) && Object.values(value).every(isShareRecordArray);
}

function isShareRegistry(value: unknown): value is ShareRegistry {
  return (
    isRecord(value) &&
    value["version"] === 2 &&
    isShareBindingMap(value["bindings"]) &&
    isShareRecordMap(value["unboundLegacy"])
  );
}

function emptyRegistry(): ShareRegistry {
  return { version: 2, bindings: {}, unboundLegacy: {} };
}

function readJson(key: string): unknown {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
}

function loadRegistry(): ShareRegistryRead {
  try {
    const parsed = readJson(SHARE_REGISTRY_KEY);
    if (parsed === null) {
      return { ok: true, registry: emptyRegistry() };
    }
    if (!isShareRegistry(parsed)) {
      console.warn("[sharing] invalid v2 share registry; ignoring it");
      return { ok: false, registry: emptyRegistry() };
    }
    return { ok: true, registry: parsed };
  } catch (error) {
    console.warn("[sharing] failed to load v2 share registry:", error);
    return { ok: false, registry: emptyRegistry() };
  }
}

function saveRegistry(registry: ShareRegistry): boolean {
  try {
    localStorage.setItem(SHARE_REGISTRY_KEY, JSON.stringify(registry));
    return true;
  } catch (error) {
    console.warn("[sharing] failed to persist v2 share registry:", error);
    return false;
  }
}

function matchesLegacyKey(tab: WorkspaceIdentity, key: string): boolean {
  return tab.id === key || tab.directoryName === key || tab.fileName === key;
}

function migrateLegacyRegistry(
  registry: ShareRegistry,
  tabs: WorkspaceIdentity[],
): ShareRegistry {
  if (
    Object.keys(registry.bindings).length > 0 ||
    Object.keys(registry.unboundLegacy).length > 0
  ) {
    return registry;
  }

  let legacy: unknown;
  try {
    legacy = readJson(LEGACY_SHARES_KEY);
  } catch (error) {
    console.warn("[sharing] failed to read legacy share registry:", error);
    return registry;
  }
  if (!isShareRecordMap(legacy)) {
    return registry;
  }

  const migrated = emptyRegistry();
  for (const [legacyKey, shares] of Object.entries(legacy)) {
    const matchingTabs = tabs.filter((tab) => matchesLegacyKey(tab, legacyKey));
    if (matchingTabs.length !== 1) {
      migrated.unboundLegacy[legacyKey] = shares;
      continue;
    }
    const ownerWorkspaceId = matchingTabs[0].workspaceId;
    for (const share of shares) {
      migrated.bindings[share.docId] = { ownerWorkspaceId, share };
    }
  }

  saveRegistry(migrated);
  return migrated;
}

function pruneExpired(registry: ShareRegistry): ShareRegistry {
  const now = Date.now();
  const bindings: Record<string, ShareBinding> = {};
  for (const [docId, binding] of Object.entries(registry.bindings)) {
    if (Date.parse(binding.share.expiresAt) > now) {
      bindings[docId] = binding;
    }
  }
  return { ...registry, bindings };
}

export function stableShareKey(tab: {
  directoryName: string | null;
  fileName: string | null;
  id: string;
}): string {
  return tab.directoryName ?? tab.fileName ?? tab.id;
}

export function saveShares(
  ownerWorkspaceId: string,
  shares: ShareRecord[],
): boolean {
  const loaded = loadRegistry();
  if (!loaded.ok) {
    return false;
  }
  const registry = loaded.registry;
  const bindings = Object.fromEntries(
    Object.entries(registry.bindings).filter(
      ([, binding]) => binding.ownerWorkspaceId !== ownerWorkspaceId,
    ),
  );
  for (const share of shares) {
    bindings[share.docId] = { ownerWorkspaceId, share };
  }
  return saveRegistry({ ...registry, bindings });
}

export function loadAndCleanShares(
  tabs: WorkspaceIdentity[],
): Record<string, ShareRecord[]> {
  const loaded = loadRegistry();
  if (!loaded.ok) {
    return {};
  }
  const migrated = migrateLegacyRegistry(loaded.registry, tabs);
  const pruned = pruneExpired(migrated);
  if (
    Object.keys(pruned.bindings).length !==
    Object.keys(migrated.bindings).length
  ) {
    saveRegistry(pruned);
  }

  const sharesByWorkspace: Record<string, ShareRecord[]> = {};
  for (const binding of Object.values(pruned.bindings)) {
    const existing = sharesByWorkspace[binding.ownerWorkspaceId] ?? [];
    sharesByWorkspace[binding.ownerWorkspaceId] = [...existing, binding.share];
  }
  return sharesByWorkspace;
}

export function getUnboundLegacyShareKeys(tabs: WorkspaceIdentity[]): string[] {
  const loaded = loadRegistry();
  if (!loaded.ok) {
    return [];
  }
  const registry = migrateLegacyRegistry(loaded.registry, tabs);
  return Object.keys(registry.unboundLegacy);
}
