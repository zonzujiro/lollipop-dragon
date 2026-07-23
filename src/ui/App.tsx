import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store";
import { useActiveTab } from "../store/selectors";
import { FilePicker } from "./components/FilePicker";
import { Header } from "./components/Header";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { FileTreeSidebar } from "./components/FileTreeSidebar";
import { ShareDialog } from "./components/ShareDialog";
import type { ShareDialogScope } from "./components/ShareDialog";
import { CommentPanel } from "./components/CommentPanel";
import { CommandPalette } from "./components/CommandPalette";
import { UndoToast } from "./components/UndoToast";
import { Toast } from "./components/Toast";
import { AgentSettingsDialog } from "./components/AgentSettingsDialog";
import { PeerNamePrompt } from "./components/PeerNamePrompt";
import { PeerTrustRibbon } from "./components/PeerTrustRibbon";
import { buildVirtualTree } from "../types/fileTree";
import { buildCommentThreadGroups } from "../markup";
import { findLiveFileInTree } from "../types/fileTree";
import type { SidebarTreeNode } from "../types/fileTree";
import { RestoreError } from "./components/RestoreError";
import { ContentUpdateBanner } from "./components/ContentUpdateBanner";
import {
  getRestoreAccessActionLabel,
  getRestoreOpenOtherLabel,
  getRestoreAccessTitle,
  shouldRenderRestorePlaceholder,
} from "../types/tab";
import { stopRelay } from "../modules/relay";
import { workspaceRuntime } from "../runtime";
import { shouldShowBrowserUnsupported } from "./browserSupport";
import {
  useThemeSync,
  useHashRouter,
  useKeyboardShortcuts,
  useFileSystemWatcher,
} from "./hooks";

const PEER_HEADER = { title: "Shared files" };

function countFiles(nodes: SidebarTreeNode[]): number {
  return nodes.reduce((total, node) => {
    if (node.kind === "file") {
      return total + 1;
    }
    return total + countFiles(node.children);
  }, 0);
}

function NoFileSelected({
  directoryName,
  fileCount,
  onOpenFolder,
}: {
  directoryName: string | null;
  fileCount: number;
  onOpenFolder: () => void;
}) {
  return (
    <div className="content-empty">
      <div className="content-empty__panel">
        <p className="content-empty__eyebrow">Folder open</p>
        <h1 className="content-empty__title">
          {directoryName ?? "Select a file"}
        </h1>
        <p className="content-empty__text">
          Choose a Markdown file from the sidebar to start reviewing.
        </p>
        {fileCount > 0 && (
          <p className="content-empty__meta">
            {fileCount} readable file{fileCount === 1 ? "" : "s"} in this
            workspace
          </p>
        )}
        <button className="content-empty__action" onClick={onOpenFolder}>
          Open another folder
        </button>
      </div>
    </div>
  );
}

function ShareUnavailable() {
  return (
    <div className="share-status">
      <svg
        className="share-status__icon"
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <h2 className="share-status__title">Document unavailable</h2>
      <p className="share-status__text">
        This shared link has been revoked by the author or has expired.
      </p>
    </div>
  );
}

// Peer mode: render the first file in the shared folder tree
function PeerViewer() {
  const sharedContent = useAppStore((s) => s.sharedContent);
  const rawContent = useAppStore((s) => s.peerRawContent);

  if (!sharedContent) {
    return <ShareUnavailable />;
  }
  if (!rawContent) {
    return <ShareUnavailable />;
  }

  return <MarkdownRenderer />;
}

const FILE_OBSERVER_TYPES = ["modified", "appeared"];
const DIR_OBSERVER_TYPES = ["appeared", "disappeared", "modified"];

function App() {
  const tab = useActiveTab();
  const tabs = useAppStore((s) => s.tabs);
  const focusMode = useAppStore((s) => s.focusMode);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const selectFile = useAppStore((s) => s.selectFile);
  const showToast = useAppStore((s) => s.showToast);
  const openDirectoryInNewTab = useAppStore((s) => s.openDirectoryInNewTab);
  const openFileInNewTab = useAppStore((s) => s.openFileInNewTab);
  const refreshFile = useAppStore((s) => s.refreshFile);
  const refreshFileTree = useAppStore((s) => s.refreshFileTree);
  const switchTab = useAppStore((s) => s.switchTab);
  const reopenTab = useAppStore((s) => s.reopenTab);
  const agentSettingsOpen = useAppStore((s) => s.agentSettingsOpen);

  // Peer mode
  const isPeerMode = useAppStore((s) => s.isPeerMode);
  const peerName = useAppStore((s) => s.peerName);
  const sharedContent = useAppStore((s) => s.sharedContent);
  const selectPeerFile = useAppStore((s) => s.selectPeerFile);
  const peerCommentPanelOpen = useAppStore((s) => s.peerCommentPanelOpen);
  const peerActiveFilePath = useAppStore((s) => s.peerActiveFilePath);

  useThemeSync();
  const peerModeChecked = useHashRouter();
  useKeyboardShortcuts();
  const [shareScope, setShareScope] = useState<ShareDialogScope | null>(null);

  const handleHostSelect = useCallback(
    async (path: string) => {
      if (!tab) {
        return;
      }

      const node = findLiveFileInTree(tab.fileTree, path);
      if (node) {
        await selectFile(node);
        return;
      }

      await switchTab(tab.id);
      const restoredTab = useAppStore
        .getState()
        .tabs.find((currentTab) => currentTab.id === tab.id);
      if (!restoredTab) {
        return;
      }

      const restoredNode = findLiveFileInTree(restoredTab.fileTree, path);
      if (restoredNode) {
        await useAppStore.getState().selectFile(restoredNode);
        return;
      }

      showToast("Folder access expired — reopen the folder to restore files");
    },
    [tab, selectFile, showToast, switchTab],
  );

  const handleHostSelectSafely = useCallback(
    (path: string) => {
      handleHostSelect(path).catch((error: unknown) => {
        console.error("[App] failed to open file from tree:", error);
      });
    },
    [handleHostSelect],
  );

  const handleOpenFolderSafely = useCallback(() => {
    openDirectoryInNewTab().catch((error: unknown) => {
      console.error("[App] failed to open folder:", error);
    });
  }, [openDirectoryInNewTab]);

  const hostTree = useMemo<SidebarTreeNode[]>(() => {
    const fileTree = tab?.fileTree ?? [];
    if (!tab || !tab.directoryName || fileTree.length === 0) {
      return fileTree;
    }
    return [
      {
        kind: "directory",
        name: tab.directoryName,
        path: "",
        children: fileTree,
      },
    ];
  }, [tab]);

  const hostCommentCounts = useMemo(() => {
    if (!tab) {
      return {};
    }
    return Object.values(tab.allFileComments).reduce<Record<string, number>>(
      (counts, entry) => ({
        ...counts,
        [entry.filePath]: buildCommentThreadGroups(entry.comments).length,
      }),
      {},
    );
  }, [tab]);

  const hostHeader = useMemo(
    () => ({
      title: tab?.directoryName ?? "",
    }),
    [tab?.directoryName],
  );

  const peerTree = useMemo(() => {
    if (!sharedContent) {
      return [];
    }
    return buildVirtualTree(Object.keys(sharedContent.tree));
  }, [sharedContent]);

  const peerHeader = PEER_HEADER;

  useFileSystemWatcher({
    handle: tab?.fileHandle ?? null,
    onRefresh: refreshFile,
    pollIntervalMs: 2000,
    relevantTypes: FILE_OBSERVER_TYPES,
  });

  useFileSystemWatcher({
    handle: tab?.directoryHandle ?? null,
    onRefresh: refreshFileTree,
    pollIntervalMs: 5000,
    recursive: true,
    relevantTypes: DIR_OBSERVER_TYPES,
  });

  useEffect(() => {
    const handleBeforeUnload = () => {
      stopRelay();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // ── Peer mode (full-screen takeover, no tabs) ──
  if (isPeerMode) {
    if (!peerModeChecked) {
      return null;
    }
    if (!peerName) {
      return <PeerNamePrompt />;
    }
    return (
      <div className="app-layout">
        <PeerTrustRibbon />
        <Header peerMode />
        <div className="app-body">
          {sharedContent && Object.keys(sharedContent.tree).length > 1 && (
            <FileTreeSidebar
              tree={peerTree}
              activeFilePath={peerActiveFilePath}
              onSelect={selectPeerFile}
              header={peerHeader}
            />
          )}
          <main className="app-main">
            <ContentUpdateBanner />
            <PeerViewer />
          </main>
          {peerCommentPanelOpen && <CommentPanel peerMode />}
        </div>
        <Toast />
        <CommandPalette />
      </div>
    );
  }

  if (!peerModeChecked) {
    return null;
  }

  // ── Web host mode requires File System Access API (Chrome/Edge over HTTPS) ──
  if (shouldShowBrowserUnsupported(workspaceRuntime, window)) {
    return (
      <div className="app-unsupported">
        <h1>Browser not supported</h1>
        <p>
          This app requires the{" "}
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API"
            target="_blank"
            rel="noopener noreferrer"
          >
            File System Access API
          </a>{" "}
          to open and edit local files.
        </p>
        <p>
          Please use <strong>Google Chrome</strong> or{" "}
          <strong>Microsoft Edge</strong> over a{" "}
          <strong>secure connection (HTTPS)</strong>.
        </p>
        {!window.isSecureContext && (
          <p className="app-unsupported__hint">
            This page is not served over HTTPS, which may disable the API even
            in supported browsers.
          </p>
        )}
      </div>
    );
  }

  // ── No tabs open → show FilePicker ──
  if (tabs.length === 0) {
    return (
      <>
        <FilePicker />
        <Toast />
        <CommandPalette />
        {agentSettingsOpen && <AgentSettingsDialog />}
      </>
    );
  }

  // ── Host mode with tabs ──
  const hasFolderOpen = (tab?.fileTree.length ?? 0) > 0;
  const showRestorePlaceholder = shouldRenderRestorePlaceholder(tab);

  return (
    <div className="app-layout">
      {!focusMode && (
        <Header
          onShareFile={() =>
            setShareScope({
              kind: "current-file",
              label: tab?.fileName ?? "document",
            })
          }
          onShareFolder={() =>
            setShareScope({
              kind: "current-folder",
              label: tab?.directoryName ?? "folder",
              entityPath: "",
            })
          }
        />
      )}
      <div className="app-body">
        {hasFolderOpen && tab?.sidebarOpen && !focusMode && (
          <FileTreeSidebar
            tree={hostTree}
            activeFilePath={tab?.activeFilePath ?? null}
            onSelect={handleHostSelectSafely}
            header={hostHeader}
            commentCounts={hostCommentCounts}
            onCollapse={toggleSidebar}
          />
        )}
        {hasFolderOpen && !tab?.sidebarOpen && !focusMode && (
          <button
            className="sidebar-reopen"
            onClick={toggleSidebar}
            aria-label="Show sidebar"
            title="Show sidebar (⌘B)"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
        <main className="app-main">
          {showRestorePlaceholder ? (
            <RestoreError
              title={getRestoreAccessTitle(tab)}
              actionLabel={getRestoreAccessActionLabel(tab)}
              secondaryActionLabel={getRestoreOpenOtherLabel(tab)}
              onReopen={() => {
                void reopenTab(tab.id);
              }}
              onOpenOther={() => {
                if (tab.directoryName) {
                  void openDirectoryInNewTab();
                  return;
                }
                void openFileInNewTab();
              }}
            />
          ) : tab?.fileName ? (
            <MarkdownRenderer />
          ) : (
            <NoFileSelected
              directoryName={tab?.directoryName ?? null}
              fileCount={countFiles(hostTree)}
              onOpenFolder={handleOpenFolderSafely}
            />
          )}
        </main>
        {tab?.commentPanelOpen && !focusMode && <CommentPanel />}
      </div>
      {shareScope && (
        <ShareDialog onClose={() => setShareScope(null)} scope={shareScope} />
      )}
      <UndoToast />
      <Toast />
      <CommandPalette
        onShare={() =>
          setShareScope({
            kind: "current-file",
            label: tab?.fileName ?? "document",
          })
        }
      />
      {agentSettingsOpen && <AgentSettingsDialog />}
      {focusMode && (
        <button
          onClick={toggleFocusMode}
          aria-label="Exit focus mode"
          title="Exit focus mode"
          className="focus-exit-btn"
        >
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
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default App;
