import "./ShareDialog.css";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../../store";
import { useActiveTab } from "../../../store/selectors";
import type { PreparedShareIdentity } from "../../../modules/sharing/types";
import { prepareShareIdentity } from "../../../modules/sharing/shareIdentity";
import { buildShareUrlFromOrigin } from "../../../utils/shareUrl";
import { PendingCommentReview } from "../PendingCommentReview";
import {
  FileScopeIcon,
  FolderScopeIcon,
  LockIcon,
  ShareUrlPreview,
  ShieldIcon,
} from "./ShareDialogVisuals";
import {
  buildShareOptions,
  countFiles,
  EMPTY_SHARES,
  entityPathFromScope,
  formatCreated,
  formatExpiry,
  isExistingShareMatch,
  TTL_OPTIONS,
  type ShareDialogScope,
} from "./shareDialogModel";

interface Props {
  onClose: () => void;
  scope?: ShareDialogScope;
}

export type { ShareDialogScope } from "./shareDialogModel";

export function ShareDialog({ onClose, scope }: Props) {
  const tab = useActiveTab();
  const shareContent = useAppStore((state) => state.shareContent);
  const revokeShare = useAppStore((state) => state.revokeShare);
  const showToast = useAppStore((state) => state.showToast);
  const fileName = tab?.fileName ?? "document";
  const directoryName = tab?.directoryName ?? null;
  const shares = tab?.shares ?? EMPTY_SHARES;
  const pendingComments = tab?.pendingComments ?? {};
  const defaultScope: ShareDialogScope = directoryName
    ? { kind: "current-folder", label: directoryName, entityPath: "" }
    : { kind: "current-file", label: fileName };
  const [selectedScope, setSelectedScope] = useState<ShareDialogScope>(
    scope ?? defaultScope,
  );
  const [ttl, setTtl] = useState(604800);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [uploadingAction, setUploadingAction] = useState<
    "link" | "slack" | null
  >(null);
  const [preparedIdentity, setPreparedIdentity] =
    useState<PreparedShareIdentity | null>(null);
  const [identityStatus, setIdentityStatus] = useState<
    "preparing" | "ready" | "failed"
  >("preparing");
  const [identityAttempt, setIdentityAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [revokeDocId, setRevokeDocId] = useState<string | null>(null);
  const [copiedAction, setCopiedAction] = useState<"link" | "slack" | null>(
    null,
  );

  const label = selectedScope?.label ?? directoryName ?? fileName;
  const entityPath = entityPathFromScope(
    selectedScope,
    tab?.activeFilePath ?? null,
  );
  const existingShare = useMemo(
    () =>
      shares.find(
        (share) =>
          new Date(share.expiresAt) > new Date() &&
          isExistingShareMatch({
            share,
            scope: selectedScope,
            label,
            entityPath,
          }),
      ),
    [entityPath, label, selectedScope, shares],
  );
  const uploadedLink =
    generatedLink ??
    (existingShare
      ? buildShareUrlFromOrigin({
          keyB64: existingShare.keyB64,
          name: existingShare.label,
        })
      : null);
  const preparedLink = preparedIdentity
    ? buildShareUrlFromOrigin({ keyB64: preparedIdentity.keyB64, name: label })
    : null;
  const link = uploadedLink ?? preparedLink;
  // The file/folder selector only makes sense when a folder is open — a
  // single-file workspace has nothing to toggle to.
  const isFolderOpen = Boolean(tab?.directoryName);
  const canChooseScope =
    selectedScope?.kind !== "nodes" && Boolean(tab) && isFolderOpen;
  const folderFileCount = countFiles(tab?.fileTree ?? []);

  useEffect(() => {
    if (uploadedLink) {
      return;
    }
    let cancelled = false;
    prepareShareIdentity()
      .then((identity) => {
        if (!cancelled) {
          setPreparedIdentity(identity);
          setIdentityStatus("ready");
        }
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Secure link preparation failed",
          );
          setIdentityStatus("failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [identityAttempt, uploadedLink]);

  async function copyLink(url: string, message = "Link copied") {
    try {
      await navigator.clipboard.writeText(url);
      showToast(message);
      return true;
    } catch (caughtError) {
      console.error("[ShareDialog] failed to copy link:", caughtError);
      showToast("Couldn't copy link");
      return false;
    }
  }

  function chooseScope(nextScope: ShareDialogScope) {
    setSelectedScope(nextScope);
    setGeneratedLink(null);
    setCopiedAction(null);
    setError(null);
    if (generatedLink) {
      setPreparedIdentity(null);
      setIdentityStatus("preparing");
      setIdentityAttempt((attempt) => attempt + 1);
    }
  }

  async function publishAndCopy(action: "link" | "slack") {
    if (!link || uploadingAction) {
      return;
    }
    setUploadingAction(action);
    setError(null);
    try {
      let shareUrl = uploadedLink;
      if (!shareUrl) {
        if (!preparedIdentity) {
          throw new Error("Secure link is still being prepared");
        }
        shareUrl = await shareContent(
          buildShareOptions(ttl, selectedScope, preparedIdentity),
        );
        setGeneratedLink(shareUrl);
        setPreparedIdentity(null);
        showToast("Encrypted share uploaded");
      }
      const text =
        action === "slack" ? `Please review ${label}: ${shareUrl}` : shareUrl;
      const copied = await copyLink(
        text,
        action === "slack"
          ? "Slack message copied"
          : "Link copied to clipboard",
      );
      if (copied) {
        setCopiedAction(action);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Share failed",
      );
    } finally {
      setUploadingAction(null);
    }
  }

  function retryIdentityPreparation() {
    setError(null);
    setIdentityStatus("preparing");
    setIdentityAttempt((attempt) => attempt + 1);
  }

  function copyButtonLabel(input: {
    action: "link" | "slack";
    idleLabel: string;
  }): string {
    if (uploadingAction === input.action) {
      return "Encrypting & uploading…";
    }
    if (copiedAction === input.action) {
      return "Copied ✓";
    }
    return input.idleLabel;
  }

  return (
    <div
      className="share-dialog__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Share review"
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <div className="share-dialog">
        <div className="share-dialog__header">
          <div>
            <h2 className="share-dialog__title">Share for review</h2>
            <p className="share-dialog__subtitle">
              Reviewers only need the link — no account, no install. Content is
              encrypted before it leaves this browser.
            </p>
          </div>
          <button
            className="share-dialog__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <section
          className="share-dialog__create"
          aria-label="Create share link"
        >
          {canChooseScope && (
            <div className="share-dialog__segments" aria-label="Share scope">
              <button
                className={
                  selectedScope?.kind === "current-file" ? "is-active" : ""
                }
                aria-pressed={selectedScope?.kind === "current-file"}
                disabled={Boolean(uploadedLink) || Boolean(uploadingAction)}
                onClick={() =>
                  chooseScope({ kind: "current-file", label: fileName })
                }
              >
                <FileScopeIcon /> This file
              </button>
              {tab?.directoryName && (
                <button
                  className={
                    selectedScope?.kind === "current-folder" ? "is-active" : ""
                  }
                  aria-pressed={selectedScope?.kind === "current-folder"}
                  disabled={Boolean(uploadedLink) || Boolean(uploadingAction)}
                  onClick={() =>
                    chooseScope({
                      kind: "current-folder",
                      label: directoryName,
                      entityPath: "",
                    })
                  }
                >
                  <FolderScopeIcon /> Whole folder · {folderFileCount} files
                </button>
              )}
            </div>
          )}

          <div className="share-dialog__expiry">
            <span className="share-dialog__expiry-label">Expires after</span>
            <div className="share-dialog__expiry-options">
              {TTL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={ttl === option.value ? "is-active" : ""}
                  aria-pressed={ttl === option.value}
                  disabled={Boolean(uploadedLink) || Boolean(uploadingAction)}
                  onClick={() => setTtl(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="share-dialog__error">{error}</p>}

          <div className="share-dialog__link-box">
            <p className="share-dialog__link-ready">
              <LockIcon /> Encrypted link — key never leaves the URL
            </p>
            {link ? (
              <ShareUrlPreview link={link} />
            ) : (
              <p className="share-dialog__preparing">
                {identityStatus === "failed"
                  ? "Could not prepare the secure link."
                  : "Preparing secure link…"}
              </p>
            )}
            {identityStatus === "failed" ? (
              <button
                className="share-dialog__primary"
                onClick={retryIdentityPreparation}
              >
                Retry
              </button>
            ) : (
              link && (
                <>
                  <button
                    className="share-dialog__primary"
                    onClick={() => void publishAndCopy("link")}
                    disabled={Boolean(uploadingAction)}
                  >
                    {copyButtonLabel({
                      action: "link",
                      idleLabel: "Copy link",
                    })}
                  </button>
                  <button
                    onClick={() => void publishAndCopy("slack")}
                    disabled={Boolean(uploadingAction)}
                  >
                    {copyButtonLabel({
                      action: "slack",
                      idleLabel: "Copy as Slack message",
                    })}
                  </button>
                </>
              )
            )}
          </div>

          <p className="share-dialog__keynote">
            <ShieldIcon />
            <span>
              The decryption key lives in the <strong>#fragment</strong> of the
              URL, which browsers never send to any server. Our storage only
              ever sees encrypted bytes. The share auto-purges when it expires.
            </span>
          </p>
        </section>

        <section className="share-dialog__active" aria-label="Active shares">
          <div className="share-dialog__section-heading">
            <h3>Active shares · this workspace</h3>
          </div>
          {shares.length === 0 ? (
            <p className="share-dialog__empty">No active links yet.</p>
          ) : (
            <ul className="share-dialog__share-list">
              {shares.map((share) => {
                const pending = pendingComments[share.docId] ?? [];
                const canReview =
                  share.pendingCommentCount > 0 || pending.length > 0;
                const expanded = expandedDocId === share.docId;
                const confirmingRevoke = revokeDocId === share.docId;
                return (
                  <li key={share.docId} className="share-dialog__share-item">
                    <span
                      className="share-dialog__share-avatar"
                      aria-hidden="true"
                    >
                      {share.fileCount > 1 ? "F" : "D"}
                    </span>
                    <div className="share-dialog__share-copy">
                      <strong>{share.label}</strong>
                      <span>
                        {share.fileCount > 1 ? "folder" : "file"} ·{" "}
                        {formatCreated(share.createdAt)} ·{" "}
                        {formatExpiry(share.expiresAt)}
                      </span>
                    </div>
                    <div className="share-dialog__share-actions">
                      {share.pendingCommentCount > 0 && (
                        <span className="share-dialog__pending">
                          {share.pendingCommentCount} pending
                        </span>
                      )}
                      {canReview && (
                        <button
                          onClick={() =>
                            setExpandedDocId(expanded ? null : share.docId)
                          }
                        >
                          {expanded ? "Hide review" : "Review comments"}
                        </button>
                      )}
                      {confirmingRevoke ? (
                        <>
                          <button
                            className="share-dialog__danger"
                            onClick={() => {
                              void revokeShare(share.docId);
                              setRevokeDocId(null);
                            }}
                          >
                            Confirm
                          </button>
                          <button onClick={() => setRevokeDocId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="share-dialog__danger"
                          onClick={() => setRevokeDocId(share.docId)}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <div className="share-dialog__pending-review">
                        {pending.length > 0 ? (
                          <PendingCommentReview docId={share.docId} />
                        ) : (
                          <p>No pending comments.</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
