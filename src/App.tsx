import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "./store";
import { useActiveTab } from "./store/selectors";
import { FilePicker } from "./components/FilePicker";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { FileTreeSidebar } from "./components/FileTreeSidebar";
import { ShareDialog } from "./components/ShareDialog";
import { CommentPanel } from "./components/CommentPanel";
import { SharedPanel } from "./components/SharedPanel";
import { PresentationMode } from "./components/PresentationMode";
import { UndoToast } from "./components/UndoToast";
import { Toast } from "./components/Toast";
import { PeerNamePrompt } from "./components/PeerNamePrompt";
import { buildVirtualTree } from "./services/fileSystem";
import { findLiveFileInTree, toFileTreeNodes } from "./types/fileTree";
import type { FileTreeNode, SidebarTreeNode } from "./types/fileTree";
import { RestoreError } from "./components/RestoreError";
import { WORKER_URL } from "./config";
import {
  useThemeSync,
  useHashRouter,
  useKeyboardShortcuts,
  useFileSystemWatcher,
} from "./hooks";

const PEER_HEADER = { title: "Shared files" };

const folderIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
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

function NoFileSelected() {
  return (
    <div className="content-empty">
      <p className="content-empty__text">
        Select a file from the sidebar to start reading
      </p>
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
  const presentationMode = useAppStore((s) => s.presentationMode);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const enterPresentationMode = useAppStore((s) => s.enterPresentationMode);
  const selectFile = useAppStore((s) => s.selectFile);
  const showToast = useAppStore((s) => s.showToast);
  const openDirectoryInNewTab = useAppStore((s) => s.openDirectoryInNewTab);
  const refreshFile = useAppStore((s) => s.refreshFile);
  const refreshFileTree = useAppStore((s) => s.refreshFileTree);
  const switchTab = useAppStore((s) => s.switchTab);
  const reopenTab = useAppStore((s) => s.reopenTab);

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
  const [shareScope, setShareScope] = useState<{
    nodes: FileTreeNode[];
    label: string;
  } | null>(null);

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

  const handleHostShare = useCallback(
    (nodes: SidebarTreeNode[], label: string) => {
      setShareScope({ nodes: toFileTreeNodes(nodes), label });
    },
    [],
  );

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

  const hostHeader = useMemo(
    () => ({
      title: tab?.directoryName ?? "",
      action: {
        onClick: openDirectoryInNewTab,
        label: "Open another folder",
        icon: folderIcon,
      },
    }),
    [tab?.directoryName, openDirectoryInNewTab],
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
      useAppStore.getState().closeRelay();
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
            <PeerViewer />
          </main>
          {peerCommentPanelOpen && <CommentPanel peerMode />}
        </div>
        <Toast />
      </div>
    );
  }

  if (!peerModeChecked) {
    return null;
  }

  // ── Host mode requires File System Access API (Chrome/Edge over HTTPS) ──
  if (typeof window.showOpenFilePicker !== "function") {
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
    return <FilePicker />;
  }

  // ── Presentation mode (fullscreen slideshow) ──
  if (presentationMode) {
    return <PresentationMode />;
  }

  // ── Host mode with tabs ──
  const hasFolderOpen = (tab?.fileTree.length ?? 0) > 0;

  return (
    <div className="app-layout">
      {!focusMode && (
        <Header
          onShareFile={() =>
            setShareScope({
              nodes: [],
              label: tab?.fileName ?? "document",
            })
          }
          onShareFolder={() =>
            setShareScope({
              nodes: toFileTreeNodes(hostTree),
              label: tab?.directoryName ?? "folder",
            })
          }
          onPresent={enterPresentationMode}
        />
      )}
      {!focusMode && <TabBar />}
      <div className="app-body">
        {hasFolderOpen && tab?.sidebarOpen && !focusMode && (
          <FileTreeSidebar
            tree={hostTree}
            activeFilePath={tab?.activeFilePath ?? null}
            onSelect={handleHostSelect}
            header={hostHeader}
            onShare={WORKER_URL ? handleHostShare : undefined}
            shares={tab?.shares}
          />
        )}
        <main className="app-main">
          {tab?.restoreError ? (
            <RestoreError
              message={tab.restoreError}
              isDirectory={tab.directoryName !== null}
              onReopen={() => reopenTab(tab.id)}
            />
          ) : tab?.fileName ? (
            <MarkdownRenderer />
          ) : (
            <NoFileSelected />
          )}
        </main>
        {tab?.commentPanelOpen && !focusMode && <CommentPanel />}
        {tab?.sharedPanelOpen && !focusMode && <SharedPanel />}
      </div>
      {shareScope && (
        <ShareDialog
          onClose={() => setShareScope(null)}
          scope={shareScope.nodes}
          scopeLabel={shareScope.label}
        />
      )}
      <UndoToast />
      <Toast />
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
