import "./PeerTrustRibbon.css";
import { useAppStore } from "../../../store";

export function PeerTrustRibbon() {
  const sharedContent = useAppStore((state) => state.sharedContent);
  const peerFileName = useAppStore((state) => state.peerFileName);
  const fileCount = sharedContent ? Object.keys(sharedContent.tree).length : 0;

  return (
    <div className="peer-trust-ribbon" role="status">
      <span className="peer-trust-ribbon__lock" aria-hidden="true">
        ⌁
      </span>
      <span>
        <strong>{peerFileName ?? "Shared review"}</strong>
        <span>
          End-to-end encrypted · read &amp; comment · {fileCount} file
          {fileCount === 1 ? "" : "s"}
        </span>
      </span>
      <span className="peer-trust-ribbon__key">
        The decryption key stays in this link
      </span>
    </div>
  );
}
