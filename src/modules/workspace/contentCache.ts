const CONTENT_CACHE_PREFIX = "markreview-workspace-content-v1:";

function contentCacheKey(workspaceId: string): string {
  return `${CONTENT_CACHE_PREFIX}${workspaceId}`;
}

export function loadWorkspaceContent(workspaceId: string): string | null {
  try {
    return localStorage.getItem(contentCacheKey(workspaceId));
  } catch (error) {
    console.warn("[workspace] failed to load cached content:", error);
    return null;
  }
}

export function saveWorkspaceContent(
  workspaceId: string,
  rawContent: string,
): boolean {
  try {
    localStorage.setItem(contentCacheKey(workspaceId), rawContent);
    return true;
  } catch (error) {
    console.warn("[workspace] failed to persist cached content:", error);
    return false;
  }
}
