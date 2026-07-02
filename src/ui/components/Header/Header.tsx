import "./Header.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAddressCommentsAgentPrompt,
  buildAgentReplyPrompt,
  buildCommentThreadGroups,
  buildFolderAddressCommentsAgentPrompt,
} from "../../../markup";
import {
  getActiveAgentRunForTab,
  getAddressableCommentTargets,
  getFolderAddressableCommentTargets,
} from "../../../modules/agent-workflow";
import { useAppStore } from "../../../store";
import { useActiveTab } from "../../../store/selectors";
import { selectUnsubmittedPeerComments } from "../../../modules/peer-review";
import { selectDocumentUpdateAvailable } from "../../../modules/relay";
import { SunIcon, MoonIcon } from "../Icons";
import { HistoryDropdown } from "../HistoryDropdown";
import { TableOfContents } from "../TableOfContents";
import { ConnectionStatus } from "../ConnectionStatus";
import { WORKER_URL } from "../../../config";
import { syncActiveShares } from "../../../modules/sharing";
import { canRunAgent } from "../../../runtime";
import { downloadActiveFile } from "./downloadActiveFile";
import { tabRequiresRestoreAccess } from "../../../types/tab";
import type { Comment } from "../../../types/criticmarkup";
import type { TabState } from "../../../types/tab";

function FocusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function FloppyDiskIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7" />
    </svg>
  );
}

function OpenFileIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function OpenFolderIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function ShareFileIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 15l2-2 2 2" />
      <path d="M12 17v-4" />
    </svg>
  );
}

function ShareFolderIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <path d="M10 15l2-2 2 2" />
      <path d="M12 17v-4" />
    </svg>
  );
}

function SharedLinksIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 0-15-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function SubmitIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

function PresentIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 3 14 9-14 9V3z" />
    </svg>
  );
}

const ACTIVE_AGENT_RUN_STATUSES = new Set([
  "queued",
  "running",
  "needs_attention",
]);
const EMPTY_COMMENTS: Comment[] = [];
const EMPTY_ALL_FILE_COMMENTS: TabState["allFileComments"] = {};
const EMPTY_FILE_TREE: TabState["fileTree"] = [];
const EMPTY_SHARES: TabState["shares"] = [];

interface FileCommentEntry {
  filePath: string;
  fileName: string;
  comments: Comment[];
}

interface HeaderMenuPosition {
  top: number;
  right: number;
}

function getRootOnlyComments(comments: Comment[]): Comment[] {
  return buildCommentThreadGroups(comments).map((group) => group.root);
}

function getRootOnlyFileComments(
  allFileComments: TabState["allFileComments"],
): FileCommentEntry[] {
  return Object.values(allFileComments)
    .map((entry) => ({
      ...entry,
      comments: getRootOnlyComments(entry.comments),
    }))
    .filter((entry) => entry.comments.length > 0)
    .sort((entryA, entryB) => entryA.filePath.localeCompare(entryB.filePath));
}

interface Props {
  peerMode?: boolean;
  onShareFile?: () => void;
  onShareFolder?: () => void;
  onPresent?: () => void;
}

export function Header({
  peerMode = false,
  onShareFile,
  onShareFolder,
  onPresent,
}: Props) {
  const tab = useActiveTab();
  const openFileInNewTab = useAppStore((s) => s.openFileInNewTab);
  const openDirectoryInNewTab = useAppStore((s) => s.openDirectoryInNewTab);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleCommentPanel = useAppStore((s) => s.toggleCommentPanel);
  const toggleSharedPanel = useAppStore((s) => s.toggleSharedPanel);
  const syncPeerComments = useAppStore((s) => s.syncPeerComments);
  const documentUpdateAvailable = useAppStore(selectDocumentUpdateAvailable);

  const myPeerComments = useAppStore((s) => s.myPeerComments);
  const peerActiveFilePath = useAppStore((s) => s.peerActiveFilePath);
  const unsubmittedPeerCount = useAppStore(
    (s) => selectUnsubmittedPeerComments(s).length,
  );

  const fileName = tab?.fileName ?? null;
  const directoryName = tab?.directoryName ?? null;
  const fileTree = tab?.fileTree ?? EMPTY_FILE_TREE;
  const sidebarOpen = tab?.sidebarOpen ?? false;
  const comments = tab?.comments ?? EMPTY_COMMENTS;
  const allFileComments = tab?.allFileComments ?? EMPTY_ALL_FILE_COMMENTS;
  const activeFilePath = tab?.activeFilePath ?? null;
  const peerCommentPanelOpen = useAppStore((s) => s.peerCommentPanelOpen);
  const rawCommentPanelOpen = peerMode
    ? peerCommentPanelOpen
    : (tab?.commentPanelOpen ?? false);
  const shares = tab?.shares ?? EMPTY_SHARES;
  const rawSharedPanelOpen = tab?.sharedPanelOpen ?? false;
  const hasActiveShares = shares.some(
    (share) => new Date(share.expiresAt) > new Date(),
  );

  const hasFolderComments = !peerMode && fileTree.length > 0;
  const crossFileTotal = hasFolderComments
    ? Object.values(allFileComments).reduce(
        (sum, entry) => sum + buildCommentThreadGroups(entry.comments).length,
        0,
      )
    : 0;
  const peerCommentsForFile = peerMode
    ? myPeerComments.filter((comment) => comment.path === peerActiveFilePath)
    : [];
  const commentCount = peerMode
    ? peerCommentsForFile.length
    : hasFolderComments
      ? crossFileTotal
      : buildCommentThreadGroups(comments).length;
  const isDark = theme === "dark";
  const hasFolderOpen = fileTree.length > 0;
  const hasContent = !!(fileName || directoryName);
  const disableHostReviewActions = !peerMode && tabRequiresRestoreAccess(tab);
  const commentPanelOpen = disableHostReviewActions
    ? false
    : rawCommentPanelOpen;
  const sharedPanelOpen = disableHostReviewActions ? false : rawSharedPanelOpen;
  const showToast = useAppStore((state) => state.showToast);
  const startAddressCommentsAgentRun = useAppStore(
    (state) => state.startAddressCommentsAgentRun,
  );
  const startQuestionThreadAgentRun = useAppStore(
    (state) => state.startQuestionThreadAgentRun,
  );
  const activeAgentRun = useAppStore((state) =>
    tab?.id ? getActiveAgentRunForTab(state, tab.id) : null,
  );
  const totalPending = shares.reduce(
    (total, share) => total + share.pendingCommentCount,
    0,
  );

  const contextLabel = peerMode
    ? (useAppStore.getState().peerFileName ?? "Shared document")
    : hasFolderOpen
      ? "Folder review"
      : hasContent
        ? "File review"
        : "";
  const rootComments = useMemo(() => getRootOnlyComments(comments), [comments]);
  const crossFileComments = useMemo(
    () => getRootOnlyFileComments(allFileComments),
    [allFileComments],
  );
  const addressableCommentTargets = useMemo(() => {
    if (peerMode || hasFolderComments) {
      return [];
    }
    return getAddressableCommentTargets(comments);
  }, [comments, hasFolderComments, peerMode]);
  const folderAddressableCommentTargets = useMemo(() => {
    if (peerMode || !hasFolderComments) {
      return [];
    }
    return getFolderAddressableCommentTargets(crossFileComments);
  }, [crossFileComments, hasFolderComments, peerMode]);
  const hasAddressableComments = hasFolderComments
    ? folderAddressableCommentTargets.length > 0
    : addressableCommentTargets.length > 0;
  const hasQuestionThreads =
    !peerMode &&
    (hasFolderComments
      ? crossFileComments.some((entry) =>
          entry.comments.some(
            (comment) => comment.type === "question" && !!comment.thread,
          ),
        )
      : rootComments.some(
          (comment) => comment.type === "question" && !!comment.thread,
        ));
  const activeAgentRunInProgress = Boolean(
    activeAgentRun && ACTIVE_AGENT_RUN_STATUSES.has(activeAgentRun.status),
  );
  const showAgentActions =
    !peerMode &&
    hasContent &&
    !disableHostReviewActions &&
    (hasAddressableComments || hasQuestionThreads);

  async function handleCopyAddressCommentsPrompt() {
    const targetPath = activeFilePath ?? fileName ?? "the active markdown file";
    const prompt = hasFolderComments
      ? buildFolderAddressCommentsAgentPrompt({
          targets: folderAddressableCommentTargets,
        })
      : buildAddressCommentsAgentPrompt({
          targetPath,
          comments: addressableCommentTargets,
        });
    try {
      await navigator.clipboard.writeText(prompt);
      showToast("Agent review prompt copied");
    } catch (error) {
      console.error("[Header] failed to copy review prompt:", error);
      showToast("Couldn't copy agent prompt");
    }
  }

  async function handleCopyQuestionPrompt() {
    try {
      await navigator.clipboard.writeText(buildAgentReplyPrompt());
      showToast("Agent prompt copied");
    } catch (error) {
      console.error("[Header] failed to copy question prompt:", error);
      showToast("Couldn't copy agent prompt");
    }
  }

  async function handleAddressCommentsAction() {
    if (!canRunAgent) {
      await handleCopyAddressCommentsPrompt();
      return;
    }
    const result = await startAddressCommentsAgentRun();
    if (result.status === "unavailable") {
      showToast(result.message);
    }
  }

  async function handleQuestionThreadAction() {
    if (!canRunAgent) {
      await handleCopyQuestionPrompt();
      return;
    }
    const result = await startQuestionThreadAgentRun();
    if (result.status === "unavailable") {
      showToast(result.message);
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header__left">
          {hasFolderOpen && !peerMode && (
            <button
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              title={sidebarOpen ? "Hide sidebar (⌘B)" : "Show sidebar (⌘B)"}
              className="app-header__btn app-header__btn--icon"
            >
              <SidebarIcon />
            </button>
          )}
          <span className="app-header__filename">{contextLabel}</span>
          {peerMode && (
            <span className="app-header__peer-badge">Reviewing</span>
          )}
          <ConnectionStatus />
        </div>

        <div className="app-header__actions">
          {!peerMode && (
            <div className="app-header__group app-header__group--source">
              <button
                onClick={() => {
                  void openFileInNewTab();
                }}
                className="app-header__btn app-header__btn--text"
                title="Open file"
              >
                <OpenFileIcon />
                <span className="app-header__btn-label">Open file</span>
              </button>
              <button
                onClick={() => {
                  void openDirectoryInNewTab();
                }}
                className="app-header__btn app-header__btn--text"
                title="Open folder"
              >
                <OpenFolderIcon />
                <span className="app-header__btn-label">Open folder</span>
              </button>

              <HistoryDropdown />
            </div>
          )}

          {!peerMode && WORKER_URL && hasContent && (
            <div className="app-header__group app-header__group--share">
              {fileName && onShareFile && (
                <button
                  className="app-header__btn app-header__btn--text app-header__btn--share"
                  onClick={onShareFile}
                  aria-label="Share file"
                  title="Create a review link for the current file"
                  disabled={disableHostReviewActions}
                >
                  <ShareFileIcon />
                  <span className="app-header__btn-label">Share file</span>
                </button>
              )}
              {hasFolderOpen && onShareFolder && (
                <button
                  className="app-header__btn app-header__btn--text app-header__btn--share"
                  onClick={onShareFolder}
                  aria-label="Share folder"
                  title="Create a review link for the current folder"
                  disabled={disableHostReviewActions}
                >
                  <ShareFolderIcon />
                  <span className="app-header__btn-label">Share folder</span>
                </button>
              )}
              <button
                className={`app-header__btn app-header__btn--text${sharedPanelOpen ? " app-header__btn--active" : ""}`}
                onClick={toggleSharedPanel}
                title="Manage shared review links"
                disabled={disableHostReviewActions}
              >
                <SharedLinksIcon />
                <span className="app-header__btn-label">Shared links</span>
                {totalPending > 0 && (
                  <span className="app-header__badge app-header__badge--pending">
                    {totalPending}
                  </span>
                )}
              </button>
              {hasActiveShares && (
                <button
                  onClick={() => {
                    void syncActiveShares();
                  }}
                  title="Push latest content to all active shares"
                  className="app-header__btn app-header__btn--text"
                  disabled={disableHostReviewActions}
                >
                  <SyncIcon />
                  <span className="app-header__btn-label">Push update</span>
                </button>
              )}
            </div>
          )}

          <div className="app-header__group app-header__group--view">
            <TableOfContents peerMode={peerMode} />

            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={
                isDark ? "Switch to light mode" : "Switch to dark mode"
              }
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="app-header__btn app-header__btn--icon"
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>

          {peerMode && (
            <div className="app-header__group app-header__group--peer">
              {unsubmittedPeerCount > 0 && (
                <button
                  onClick={() => {
                    void syncPeerComments();
                  }}
                  aria-label="Submit comments"
                  title={
                    documentUpdateAvailable
                      ? "Refresh to the latest content before submitting comments"
                      : "Send your comments to the host"
                  }
                  className="app-header__btn app-header__btn--text"
                  disabled={documentUpdateAvailable}
                >
                  <SubmitIcon />
                  <span className="app-header__btn-label">
                    Submit comments ({unsubmittedPeerCount})
                  </span>
                </button>
              )}
              <button
                onClick={() => {
                  void downloadActiveFile();
                }}
                aria-label="Save file"
                title="Download current file as .md"
                className="app-header__btn app-header__btn--text"
              >
                <FloppyDiskIcon />
                <span className="app-header__btn-label">Save file</span>
              </button>
            </div>
          )}

          <div className="app-header__group app-header__group--review">
            {showAgentActions && (
              <ReviewAgentMenu
                disabled={activeAgentRunInProgress}
                canAddressComments={hasAddressableComments}
                canAnswerQuestions={hasQuestionThreads}
                addressLabel={
                  canRunAgent ? "Address comments" : "Copy review prompt"
                }
                questionLabel={
                  canRunAgent ? "Answer questions" : "Copy answer prompt"
                }
                onAddressComments={handleAddressCommentsAction}
                onAnswerQuestions={handleQuestionThreadAction}
              />
            )}
            <button
              onClick={toggleCommentPanel}
              aria-label={
                commentPanelOpen
                  ? "Close comments panel"
                  : "Open comments panel"
              }
              title={
                commentPanelOpen
                  ? "Close comments panel"
                  : "Open comments panel"
              }
              className={`app-header__btn app-header__btn--text app-header__btn--review${commentPanelOpen ? " app-header__btn--active" : ""}`}
              disabled={disableHostReviewActions}
            >
              <CommentIcon />
              <span className="app-header__btn-label">Comments</span>
              {commentCount > 0 && (
                <span className="app-header__badge">{commentCount}</span>
              )}
            </button>

            {!peerMode && hasContent && onPresent && (
              <button
                onClick={onPresent}
                aria-label="Enter presentation mode"
                title="Enter presentation mode"
                className="app-header__btn app-header__btn--icon"
              >
                <PresentIcon />
              </button>
            )}

            {!peerMode && (
              <button
                onClick={toggleFocusMode}
                aria-label="Enter focus mode"
                title="Enter focus mode"
                className="app-header__btn app-header__btn--icon"
              >
                <FocusIcon />
              </button>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

function ReviewAgentMenu({
  disabled,
  canAddressComments,
  canAnswerQuestions,
  addressLabel,
  questionLabel,
  onAddressComments,
  onAnswerQuestions,
}: {
  disabled: boolean;
  canAddressComments: boolean;
  canAnswerQuestions: boolean;
  addressLabel: string;
  questionLabel: string;
  onAddressComments: () => Promise<void>;
  onAnswerQuestions: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<HeaderMenuPosition | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleDocumentClick(event: MouseEvent) {
      const targetNode = event.target;
      if (targetNode instanceof Node && menuRef.current?.contains(targetNode)) {
        return;
      }
      setOpen(false);
    }

    updateMenuPosition();
    document.addEventListener("click", handleDocumentClick);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  async function handleMenuAction(action: () => Promise<void>) {
    setOpen(false);
    await action();
  }

  return (
    <div className="app-header__menu-wrap" ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`app-header__btn app-header__btn--icon app-header__btn--review${open ? " app-header__btn--active" : ""}`}
        aria-label="Review actions"
        aria-expanded={open}
        title={
          disabled
            ? "Wait for the active agent run to finish"
            : "Review actions"
        }
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (!open) {
            updateMenuPosition();
          }
          setOpen((currentOpen) => !currentOpen);
        }}
      >
        <AgentIcon />
      </button>
      {open && (
        <div
          className="app-header__menu"
          role="menu"
          style={{ position: "fixed", ...(menuPosition ?? {}) }}
        >
          {canAddressComments && (
            <button
              type="button"
              className="app-header__menu-item"
              role="menuitem"
              onClick={() => {
                void handleMenuAction(onAddressComments);
              }}
            >
              {addressLabel}
            </button>
          )}
          {canAnswerQuestions && (
            <button
              type="button"
              className="app-header__menu-item"
              role="menuitem"
              onClick={() => {
                void handleMenuAction(onAnswerQuestions);
              }}
            >
              {questionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
