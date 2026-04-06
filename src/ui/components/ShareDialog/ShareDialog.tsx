import "./ShareDialog.css";
import { useState } from "react";
import { useAppStore } from "../../../store";
import { useActiveTab } from "../../../store/selectors";
import { buildShareUrlFromOrigin } from "../../../utils/shareUrl";
import type { FileTreeNode } from "../../../types/fileTree";
import type { ShareRecord } from "../../../types/share";

const TTL_OPTIONS = [
  { label: "1 day", value: 86400 },
  { label: "7 days", value: 604800 },
  { label: "30 days", value: 2592000 },
];

interface Props {
  onClose: () => void;
  scope?: FileTreeNode[];
  scopeLabel?: string;
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

function entityPathFromScope(
  scope: FileTreeNode[],
  activeFilePath: string | null,
): string {
  const paths = collectFilePaths(scope);
  if (paths.length > 0) {
    return commonPathPrefix(paths);
  }
  return activeFilePath ?? "";
}

function entityPathFromRecord(record: ShareRecord): string | null {
  if (!record.sharedPaths || record.sharedPaths.length === 0) {
    return null;
  }
  return commonPathPrefix(record.sharedPaths);
}

export function ShareDialog({ onClose, scope, scopeLabel }: Props) {
  const tab = useActiveTab();
  const fileName = tab?.fileName ?? null;
  const directoryName = tab?.directoryName ?? null;
  const shareContent = useAppStore((s) => s.shareContent);
  const showToast = useAppStore((s) => s.showToast);

  const shares = tab?.shares ?? [];
  const label = scopeLabel ?? directoryName ?? fileName ?? "document";
  const currentEntityPath = entityPathFromScope(
    scope ?? [],
    tab?.activeFilePath ?? null,
  );
  const existingShare = shares.find((s) => {
    if (new Date(s.expiresAt) <= new Date()) {
      return false;
    }
    const recordPath = entityPathFromRecord(s);
    if (recordPath === null) {
      return s.label === label;
    }
    return recordPath === currentEntityPath;
  });
  const existingLink = existingShare
    ? buildShareUrlFromOrigin({
        keyB64: existingShare.keyB64,
        name: existingShare.label,
      })
    : null;

  const [ttl, setTtl] = useState(604800);
  const [link, setLink] = useState<string | null>(existingLink);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleShare() {
    setLoading(true);
    setError(null);
    try {
      const url = await shareContent({ ttl, nodes: scope, label: scopeLabel });
      setLink(url);
      showToast("Share link created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Share failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!link) {
      return;
    }
    await navigator.clipboard.writeText(link);
    showToast("Link copied to clipboard");
    onClose();
  }

  return (
    <div
      className="share-dialog__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Share document"
    >
      <div className="share-dialog">
        <div className="share-dialog__header">
          <h2 className="share-dialog__title">Share "{label}"</h2>
          <button
            className="share-dialog__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!link ? (
          <>
            <p className="share-dialog__desc">
              The document will be encrypted in your browser and uploaded to a
              private link. Anyone with the link can read it — no account
              needed.
            </p>

            <label className="share-dialog__label">
              Link expires after
              <select
                className="share-dialog__select"
                value={ttl}
                onChange={(e) => setTtl(Number(e.target.value))}
              >
                {TTL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {error && <p className="share-dialog__error">{error}</p>}

            <div className="share-dialog__actions">
              <button
                className="share-dialog__btn share-dialog__btn--cancel"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="share-dialog__btn share-dialog__btn--share"
                onClick={handleShare}
                disabled={loading}
              >
                {loading ? "Encrypting…" : "Generate link"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="share-dialog__desc share-dialog__desc--success">
              {existingLink
                ? "This file already has an active share link."
                : "Link ready. Send it to your reviewers via Slack, email, or any channel."}
            </p>

            <div className="share-dialog__link-row">
              <input
                className="share-dialog__link-input"
                value={link}
                readOnly
                aria-label="Shareable link"
                onFocus={(e) => e.target.select()}
              />
              <button
                className="share-dialog__btn share-dialog__btn--copy"
                onClick={handleCopy}
              >
                Copy
              </button>
            </div>

            <div className="share-dialog__actions">
              <button
                className="share-dialog__btn share-dialog__btn--cancel"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
