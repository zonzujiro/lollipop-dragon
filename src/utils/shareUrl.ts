export interface ShareUrlParams {
  docId: string;
  keyB64: string;
  name?: string;
}

/**
 * Build a share URL from the given base URL and share parameters.
 * Format: `${base}#share=${docId}&key=${keyB64}&name=${name}`
 */
export function buildShareUrl(base: string, params: ShareUrlParams): string {
  let url = `${base}#share=${params.docId}&key=${params.keyB64}`;
  if (params.name) {
    url += `&name=${encodeURIComponent(params.name)}`;
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
 * Returns null if the hash does not contain valid share params (share + key).
 * Old URLs with `pwd` still parse fine — we just ignore the parameter.
 */
export function parseShareHash(): ShareUrlParams | null {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const docId = params.get("share");
  const keyB64 = params.get("key");
  if (!docId || !keyB64) return null;
  const name = params.get("name") ?? undefined;
  return { docId, keyB64, name };
}

/**
 * Check whether the current hash looks like a share URL.
 * This is a lightweight check that avoids full parsing — useful for
 * deciding whether to enter peer mode before loading content.
 */
export function isShareHash(): boolean {
  const hash = window.location.hash;
  return hash.includes("share=") && hash.includes("key=");
}
