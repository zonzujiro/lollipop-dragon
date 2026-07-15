import "./Header.css";
import { useMemo } from "react";
import lollipopDragonLogo from "../../../assets/lollipop-dragon-logo.svg";
import {
  buildAddressCommentsAgentPrompt,
  buildCommentThreadGroups,
  buildFolderAddressCommentsAgentPrompt,
} from "../../../markup";
import {
  getActiveAgentRunForTab,
  getAddressableCommentTargets,
  getFolderReviewCommentTargets,
  getQuestionThreadCommentIds,
} from "../../../modules/agent-workflow";
import { useAppStore } from "../../../store";
import { useActiveTab } from "../../../store/selectors";
import { selectUnsubmittedPeerComments } from "../../../modules/peer-review";
import { selectDocumentUpdateAvailable } from "../../../modules/relay";
import { SunIcon, MoonIcon } from "../Icons";
import { ConnectionStatus } from "../ConnectionStatus";
import { TabBar } from "../TabBar";
import { syncActiveShares } from "../../../modules/sharing";
import { canRunAgent } from "../../../runtime";
import { downloadActiveFile } from "./downloadActiveFile";
import { tabRequiresRestoreAccess } from "../../../types/tab";
import { initials } from "../../../utils/peerDisplay";
import type { Comment } from "../../../types/criticmarkup";
import type { TabState } from "../../../types/tab";
import {
  AgentIcon,
  CommentRailIcon,
  FloppyDiskIcon,
  PresentIcon,
  ShareFileIcon,
  SubmitIcon,
  SyncIcon,
} from "./HeaderIcons";

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
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const toggleCommentPanel = useAppStore((s) => s.toggleCommentPanel);
  const syncPeerComments = useAppStore((s) => s.syncPeerComments);
  const documentUpdateAvailable = useAppStore(selectDocumentUpdateAvailable);

  const myPeerComments = useAppStore((s) => s.myPeerComments);
  const peerActiveFilePath = useAppStore((s) => s.peerActiveFilePath);
  const peerName = useAppStore((s) => s.peerName);
  const sharedContent = useAppStore((s) => s.sharedContent);
  const unsubmittedPeerCount = useAppStore(
    (s) => selectUnsubmittedPeerComments(s).length,
  );

  const fileName = tab?.fileName ?? null;
  const directoryName = tab?.directoryName ?? null;
  const fileTree = tab?.fileTree ?? EMPTY_FILE_TREE;
  const comments = tab?.comments ?? EMPTY_COMMENTS;
  const allFileComments = tab?.allFileComments ?? EMPTY_ALL_FILE_COMMENTS;
  const activeFilePath = tab?.activeFilePath ?? null;
  const peerCommentPanelOpen = useAppStore((s) => s.peerCommentPanelOpen);
  const rawCommentPanelOpen = peerMode
    ? peerCommentPanelOpen
    : (tab?.commentPanelOpen ?? false);
  const shares = tab?.shares ?? EMPTY_SHARES;
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
  const commentPanelOpen = rawCommentPanelOpen;
  const showToast = useAppStore((state) => state.showToast);
  const startAddressCommentsAgentRun = useAppStore(
    (state) => state.startAddressCommentsAgentRun,
  );
  const activeAgentRun = useAppStore((state) =>
    tab?.id ? getActiveAgentRunForTab(state, tab.id) : null,
  );
  const totalPending = shares.reduce(
    (total, share) => total + share.pendingCommentCount,
    0,
  );

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
  const questionThreadIds = useMemo(() => {
    if (peerMode || hasFolderComments) {
      return [];
    }
    return getQuestionThreadCommentIds(rootComments);
  }, [hasFolderComments, peerMode, rootComments]);
  const folderReviewCommentTargets = useMemo(() => {
    if (peerMode || !hasFolderComments) {
      return [];
    }
    return getFolderReviewCommentTargets(crossFileComments);
  }, [crossFileComments, hasFolderComments, peerMode]);
  const hasAddressableComments = hasFolderComments
    ? folderReviewCommentTargets.some((target) => target.comments.length > 0)
    : addressableCommentTargets.length > 0;
  const hasQuestionThreads = hasFolderComments
    ? folderReviewCommentTargets.some(
        (target) => target.questionThreadIds.length > 0,
      )
    : questionThreadIds.length > 0;
  const hasReviewTargets = hasAddressableComments || hasQuestionThreads;
  const activeAgentRunInProgress = Boolean(
    activeAgentRun && ACTIVE_AGENT_RUN_STATUSES.has(activeAgentRun.status),
  );
  const showAgentActions = !peerMode && hasContent && hasReviewTargets;

  function guardRestoreAction(message: string): boolean {
    if (!disableHostReviewActions) {
      return false;
    }
    showToast(message);
    return true;
  }

  async function handleCopyReviewPrompt() {
    const targetPath = activeFilePath ?? fileName ?? "the active markdown file";
    const prompt = hasFolderComments
      ? buildFolderAddressCommentsAgentPrompt({
          targets: folderReviewCommentTargets,
        })
      : buildAddressCommentsAgentPrompt({
          targetPath,
        });
    try {
      await navigator.clipboard.writeText(prompt);
      showToast("Review prompt copied");
    } catch (error) {
      console.error("[Header] failed to copy review prompt:", error);
      showToast("Couldn't copy agent prompt");
    }
  }

  async function handleReviewAction() {
    if (!canRunAgent) {
      await handleCopyReviewPrompt();
      return;
    }
    const result = await startAddressCommentsAgentRun();
    if (result.status === "unavailable") {
      showToast(result.message);
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header__left">
          <div className="app-header__brand">
            <img
              className="app-header__logo"
              src={lollipopDragonLogo}
              alt="Lollipop Dragon"
            />
            <span className="app-header__wordmark">
              Lollipop <em>Dragon</em>
            </span>
          </div>
          {peerMode && (
            <span className="app-header__peer-badge">Reviewing</span>
          )}
          {!peerMode && <TabBar />}
        </div>

        <div className="app-header__actions">
          <ConnectionStatus />

          {!peerMode && hasContent && (
            <div className="app-header__group app-header__group--share">
              {(onShareFile || onShareFolder) && (
                <button
                  className="app-header__btn app-header__btn--text app-header__btn--share"
                  onClick={() => {
                    if (
                      guardRestoreAction(
                        "Share management resumes once folder access is restored",
                      )
                    ) {
                      return;
                    }
                    if (hasFolderOpen) {
                      onShareFolder?.();
                      return;
                    }
                    onShareFile?.();
                  }}
                  aria-label="Share"
                  title="Create or manage encrypted review links"
                  aria-disabled={disableHostReviewActions}
                >
                  <ShareFileIcon />
                  <span className="app-header__btn-label">Share</span>
                  {totalPending > 0 && (
                    <span className="app-header__badge app-header__badge--pending">
                      {totalPending}
                    </span>
                  )}
                </button>
              )}
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

          {peerMode && (
            <div className="app-header__group app-header__group--peer">
              {peerName && (
                <div
                  className="app-header__identity"
                  title={`Reviewing as ${peerName}`}
                >
                  <span className="app-header__identity-avatar">
                    {initials(peerName)}
                  </span>
                  <span>
                    <strong>{peerName}</strong>
                    <small>
                      {Object.keys(sharedContent?.tree ?? {}).length} shared
                      files
                    </small>
                  </span>
                </div>
              )}
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
              <ReviewAgentButton
                disabled={activeAgentRunInProgress}
                readOnly={disableHostReviewActions}
                canRunAgent={canRunAgent}
                onReview={async () => {
                  if (
                    guardRestoreAction(
                      "Read-only — restore folder access first",
                    )
                  ) {
                    return;
                  }
                  await handleReviewAction();
                }}
              />
            )}
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
              className={`app-header__btn app-header__btn--icon app-header__btn--rail${commentPanelOpen ? " app-header__btn--active" : ""}`}
            >
              <CommentRailIcon />
              {commentCount > 0 && <span className="app-header__dot-badge" />}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

function ReviewAgentButton({
  disabled,
  readOnly,
  canRunAgent,
  onReview,
}: {
  disabled: boolean;
  readOnly: boolean;
  canRunAgent: boolean;
  onReview: () => Promise<void>;
}) {
  const label = canRunAgent ? "Run agent" : "Copy prompt";

  return (
    <button
      type="button"
      className={`app-header__btn app-header__btn--text app-header__btn--agent${readOnly ? " app-header__btn--guarded" : ""}`}
      aria-label={label}
      title={
        readOnly
          ? "Restore folder access to run the agent"
          : disabled
            ? "Wait for the active agent run to finish"
            : label
      }
      aria-disabled={readOnly}
      disabled={disabled}
      onClick={() => {
        void onReview();
      }}
    >
      <AgentIcon />
      <span className="app-header__btn-label">{label}</span>
    </button>
  );
}
