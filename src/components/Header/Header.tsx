import "./Header.css";
import { useAppStore } from "../../store";
import {
  useActiveTab,
  getUnsubmittedPeerComments,
} from "../../store/selectors";
import { SunIcon, MoonIcon } from "../Icons";
import { HistoryDropdown } from "../HistoryDropdown";
import { TableOfContents } from "../TableOfContents";
import { ConnectionStatus } from "../ConnectionStatus";
import { WORKER_URL } from "../../config";
import { downloadActiveFile } from "../../services/download";
import { syncActiveShares } from "../../services/shareSync";

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
  const refreshFile = useAppStore((s) => s.refreshFile);
  const loadSharedContent = useAppStore((s) => s.loadSharedContent);
  const syncPeerComments = useAppStore((s) => s.syncPeerComments);

  const myPeerComments = useAppStore((s) => s.myPeerComments);
  const peerActiveFilePath = useAppStore((s) => s.peerActiveFilePath);
  const unsubmittedPeerCount = useAppStore(
    (s) => getUnsubmittedPeerComments(s).length,
  );

  const fileName = tab?.fileName ?? null;
  const directoryName = tab?.directoryName ?? null;
  const fileTree = tab?.fileTree ?? [];
  const sidebarOpen = tab?.sidebarOpen ?? false;
  const comments = tab?.comments ?? [];
  const allFileComments = tab?.allFileComments ?? {};
  const peerCommentPanelOpen = useAppStore((s) => s.peerCommentPanelOpen);
  const commentPanelOpen = peerMode
    ? peerCommentPanelOpen
    : (tab?.commentPanelOpen ?? false);
  const fileHandle = tab?.fileHandle ?? null;
  const shares = tab?.shares ?? [];
  const sharedPanelOpen = tab?.sharedPanelOpen ?? false;
  const hasActiveShares = shares.some(
    (s) => new Date(s.expiresAt) > new Date(),
  );

  const hasFolderComments = !peerMode && fileTree.length > 0;
  const crossFileTotal = hasFolderComments
    ? Object.values(allFileComments).reduce(
        (sum, e) => sum + e.comments.length,
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
      : comments.length;
  const isDark = theme === "dark";
  const hasFolderOpen = fileTree.length > 0;
  const hasContent = !!(fileName || directoryName);
  const totalPending = shares.reduce((n, s) => n + s.pendingCommentCount, 0);

  const displayName = peerMode
    ? (useAppStore.getState().peerFileName ?? "Shared document")
    : hasFolderOpen && fileName
      ? `${directoryName} / ${fileName}`
      : (fileName ?? directoryName ?? "");

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
          <span className="app-header__filename">{displayName}</span>
          {peerMode && (
            <span className="app-header__peer-badge">Reviewing</span>
          )}
        </div>

        <div className="app-header__actions">
          {!peerMode && (
            <>
              <button
                onClick={openFileInNewTab}
                className="app-header__btn app-header__btn--text"
              >
                Open file
              </button>
              <button
                onClick={openDirectoryInNewTab}
                className="app-header__btn app-header__btn--text"
              >
                Open folder
              </button>

              <HistoryDropdown />

              {WORKER_URL && hasContent && (
                <>
                  <div className="app-header__divider" aria-hidden="true" />
                  {fileName && onShareFile && (
                    <button
                      className="app-header__btn app-header__btn--icon"
                      onClick={onShareFile}
                      aria-label="Share file"
                      title="Share file"
                    >
                      <ShareFileIcon />
                    </button>
                  )}
                  {hasFolderOpen && onShareFolder && (
                    <button
                      className="app-header__btn app-header__btn--icon"
                      onClick={onShareFolder}
                      aria-label="Share folder"
                      title="Share folder"
                    >
                      <ShareFolderIcon />
                    </button>
                  )}
                  <button
                    className={`app-header__btn app-header__btn--text${sharedPanelOpen ? " app-header__btn--active" : ""}`}
                    onClick={toggleSharedPanel}
                    title="Manage shared documents"
                  >
                    Shared
                    {totalPending > 0 && (
                      <span className="app-header__badge app-header__badge--pending">
                        {totalPending}
                      </span>
                    )}
                  </button>
                  {hasActiveShares && (
                    <button
                      onClick={syncActiveShares}
                      title="Push latest content to all active shares"
                      className="app-header__btn app-header__btn--text"
                    >
                      Push update
                    </button>
                  )}
                </>
              )}

              <div className="app-header__divider" aria-hidden="true" />
              <ConnectionStatus />
            </>
          )}

          <TableOfContents peerMode={peerMode} />

          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="app-header__btn app-header__btn--icon"
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>

          {peerMode && (
            <>
              <ConnectionStatus />
              <button
                onClick={loadSharedContent}
                aria-label="Get latest content"
                title="Fetch latest content from the host"
                className="app-header__btn app-header__btn--text"
              >
                Get latest
              </button>
              {unsubmittedPeerCount > 0 && (
                <button
                  onClick={syncPeerComments}
                  aria-label="Submit comments"
                  title="Send your comments to the host"
                  className="app-header__btn app-header__btn--text"
                >
                  Submit comments ({unsubmittedPeerCount})
                </button>
              )}
              <button
                onClick={downloadActiveFile}
                aria-label="Save file"
                title="Download current file as .md"
                className="app-header__btn app-header__btn--text"
              >
                <FloppyDiskIcon />
                Save file
              </button>
            </>
          )}

          {!peerMode && fileHandle && (
            <button
              onClick={refreshFile}
              aria-label="Refresh file"
              title="Refresh file from disk"
              className="app-header__btn app-header__btn--text"
            >
              Refresh
            </button>
          )}

          <button
            onClick={toggleCommentPanel}
            aria-label={
              commentPanelOpen ? "Close comments panel" : "Open comments panel"
            }
            title={
              commentPanelOpen ? "Close comments panel" : "Open comments panel"
            }
            className={`app-header__btn app-header__btn--text${commentPanelOpen ? " app-header__btn--active" : ""}`}
          >
            Comments
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
      </header>
    </>
  );
}
