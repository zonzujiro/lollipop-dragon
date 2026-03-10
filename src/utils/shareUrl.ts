export interface ShareUrlParams {
  keyB64: string;
  name?: string;
}

/**
 * Build a share URL from the given base URL and share parameters.
 * Format: `${base}#s=${keyB64}&n=${name}`
 */
export function buildShareUrl(base: string, params: ShareUrlParams): string {
  let url = `${base}#s=${params.keyB64}`;
  if (params.name) {
    url += `&n=${encodeURIComponent(params.name)}`;
  }
  return url;
}

/**
 * Build a share URL using the current window origin/pathname as the base.
 */
export function buildShareUrlFromOrigin(params: ShareUrlParams): string {
  const base = window.location.origin + window.location.pathname;
  return buildShareUrl(base, params);
}

/**
 * Parse the current window.location.hash for share URL parameters.
 * Returns null if the hash does not contain valid share params.
 * Supports both new format (#s=<key>&n=<name>) and old format
 * (#share=<docId>&key=<key>&name=<name>) for backward compatibility.
 */
export function parseShareHash(): ShareUrlParams | null {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);

  // New format: #s=<keyB64>&n=<name>
  const keyB64 = params.get("s");
  if (keyB64) {
    const name = params.get("n") ?? undefined;
    return { keyB64, name };
  }

  // Old format: #share=<docId>&key=<keyB64>&name=<name>
  const oldKey = params.get("key");
  if (oldKey) {
    const name = params.get("name") ?? undefined;
    return { keyB64: oldKey, name };
  }

  return null;
}

/**
 * Check whether the current hash looks like a share URL.
 * This is a lightweight check that avoids full parsing — useful for
 * deciding whether to enter peer mode before loading content.
 */
export function isShareHash(): boolean {
  const hash = window.location.hash;
  // New format
  if (/^#s=[A-Za-z0-9_-]/.test(hash)) {
    return true;
  }
  // Old format
  return hash.includes("share=") && hash.includes("key=");
}
