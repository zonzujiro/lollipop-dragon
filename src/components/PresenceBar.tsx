import { useAppStore } from "../store";

const COLORS = [
  "#4263eb",
  "#e03131",
  "#2b8a3e",
  "#e67700",
  "#7048e8",
  "#1098ad",
  "#d6336c",
  "#5c940d",
];

export function peerColor(peerId: string): string {
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) {
    hash = ((hash << 5) - hash + peerId.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function PresenceBar() {
  const peers = useAppStore((s) => s.rtPeers);
  const status = useAppStore((s) => s.rtStatus);

  if (status !== "connected" || peers.length === 0) return null;

  return (
    <div className="presence-bar" aria-label="Connected peers">
      {peers.map((peer) => (
        <span
          key={peer.peerId}
          className="presence-bar__peer"
          title={`${peer.name}${peer.activeFile ? ` — viewing ${peer.activeFile}` : ""}`}
          style={{ backgroundColor: peerColor(peer.peerId) }}
        >
          {initials(peer.name)}
        </span>
      ))}
    </div>
  );
}
