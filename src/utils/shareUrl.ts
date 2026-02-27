import { docIdToRoomId } from "../services/realtime";

export interface ShareUrlParams {
  docId: string;
  keyB64: string;
  roomId: string;
  roomPwd: string;
}

/**
 * Build a share URL from the given base URL and share parameters.
 * Format: `${base}#share=${docId}&key=${keyB64}&room=${roomId}&pwd=${roomPwd}`
 */
export function buildShareUrl(base: string, params: ShareUrlParams): string {
  return `${base}#share=${params.docId}&key=${params.keyB64}&room=${params.roomId}&pwd=${params.roomPwd}`;
}

/**
 * Build a share URL using the current window origin/pathname as the base,
 * deriving the roomId from the docId via docIdToRoomId.
 */
export function buildShareUrlFromOrigin(params: {
  docId: string;
  keyB64: string;
  roomPwd: string;
}): string {
  const base = window.location.origin + window.location.pathname;
  const roomId = docIdToRoomId(params.docId);
  return buildShareUrl(base, { ...params, roomId });
}

/**
 * Parse the current window.location.hash for share URL parameters.
 * Returns null if the hash does not contain valid share params (share + key).
 */
export function parseShareHash(): ShareUrlParams | null {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const docId = params.get("share");
  const keyB64 = params.get("key");
  if (!docId || !keyB64) return null;
  const roomId = params.get("room") ?? "";
  const roomPwd = params.get("pwd") ?? "";
  return { docId, keyB64, roomId, roomPwd };
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
