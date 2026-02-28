import { docIdToRoomId } from "../services/realtime";

export interface ShareUrlParams {
  docId: string;
  keyB64: string;
  roomPwd: string;
  name?: string;
}

/**
 * Build a share URL from the given base URL and share parameters.
 * Format: `${base}#share=${docId}&key=${keyB64}&pwd=${roomPwd}&name=${name}`
 *
 * The roomId is derived from docId on the receiving end, so it's not in the URL.
 */
export function buildShareUrl(base: string, params: ShareUrlParams): string {
  let url = `${base}#share=${params.docId}&key=${params.keyB64}&pwd=${params.roomPwd}`;
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
 * The roomId is derived from docId via docIdToRoomId.
 */
export function parseShareHash(): (ShareUrlParams & { roomId: string }) | null {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const docId = params.get("share");
  const keyB64 = params.get("key");
  if (!docId || !keyB64) return null;
  const roomPwd = params.get("pwd") ?? "";
  const name = params.get("name") ?? undefined;
  // Derive roomId from docId; also accept legacy "room" param for old URLs
  const roomId = params.get("room") ?? docIdToRoomId(docId);
  return { docId, keyB64, roomPwd, name, roomId };
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
