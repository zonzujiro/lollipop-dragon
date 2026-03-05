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
import { UndoToast } from "./components/UndoToast";
import { Toast } from "./components/Toast";
import { PeerNamePrompt } from "./components/PeerNamePrompt";
import { buildVirtualTree } from "./services/fileSystem";
import { isShareHash } from "./utils/shareUrl";
import { findFileInTree, toFileTreeNodes } from "./types/fileTree";
import type {
  FileTreeNode,
  SidebarTreeNode,
} from "./types/fileTree";
import { WORKER_URL } from "./config";

// FileSystemObserver is an experimental browser API not yet in TypeScript's
// lib types. Declare a minimal interface so we can avoid `as any`.
interface FileSystemObserverRecord {
  type: string;
}
interface FileSystemObserver {
  observe(handle: FileSystemHandle, opts?: { recursive: boolean }): Promise<void>;
  disconnect(): void;
}
interface FileSystemObserverConstructor {
  new (callback: (records: FileSystemObserverRecord[]) => void): FileSystemObserver;
}

declare global {
  interface Window {
    FileSystemObserver?: FileSystemObserverConstructor;
  }
}

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

  if (!sharedContent) return <ShareUnavailable />;
  if (!rawContent) return <ShareUnavailable />;

  return <MarkdownRenderer />;
}

function App() {
  const tab = useActiveTab();
  const tabs = useAppStore((s) => s.tabs);
  const theme = useAppStore((s) => s.theme);
  const focusMode = useAppStore((s) => s.focusMode);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const selectFile = useAppStore((s) => s.selectFile);
  const openDirectoryInNewTab = useAppStore((s) => s.openDirectoryInNewTab);
  const refreshFile = useAppStore((s) => s.refreshFile);
  const refreshFileTree = useAppStore((s) => s.refreshFileTree);
  const restoreTabs = useAppStore((s) => s.restoreTabs);

  // Peer mode
  const isPeerMode = useAppStore((s) => s.isPeerMode);
  const peerName = useAppStore((s) => s.peerName);
  const loadSharedContent = useAppStore((s) => s.loadSharedContent);
  const sharedContent = useAppStore((s) => s.sharedContent);
  const selectPeerFile = useAppStore((s) => s.selectPeerFile);
  const peerCommentPanelOpen = useAppStore((s) => s.peerCommentPanelOpen);
  const peerActiveFilePath = useAppStore((s) => s.peerActiveFilePath);

  const [peerModeChecked, setPeerModeChecked] = useState(false);
  const [shareScope, setShareScope] = useState<{
    nodes: FileTreeNode[];
    label: string;
  } | null>(null);

  const handleHostSelect = useCallback(
    (path: string) => {
      if (!tab) return;
      const node = findFileInTree(tab.fileTree, path);
      if (node) selectFile(node);
    },
    [tab, selectFile],
  );

  const handleHostShare = useCallback(
    (nodes: SidebarTreeNode[], label: string) => {
      setShareScope({ nodes: toFileTreeNodes(nodes), label });
    },
    [],
  );

  const hostTree: FileTreeNode[] = useMemo(() => {
    if (!tab || !tab.directoryName || tab.fileTree.length === 0)
      return tab?.fileTree ?? [];
    return [
      {
        kind: "directory",
        name: tab.directoryName,
        path: "",
        children: tab.fileTree,
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
    if (!sharedContent) return [];
    return buildVirtualTree(Object.keys(sharedContent.tree));
  }, [sharedContent]);

  const peerHeader = useMemo(() => ({ title: "Shared files" }), []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Check for peer mode URL on mount and on hash change
  useEffect(() => {
    function checkHash() {
      if (isShareHash() && WORKER_URL) {
        loadSharedContent().finally(() => setPeerModeChecked(true));
      } else {
        setPeerModeChecked(true);
        restoreTabs();
      }
    }
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts: Cmd+B toggles sidebar, Cmd+W closes tab, Ctrl+Tab cycles tabs
  useEffect(() => {
    const removeTab = useAppStore.getState().removeTab;
    const switchTab = useAppStore.getState().switchTab;
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (meta && e.key === "w") {
        e.preventDefault();
        const { activeTabId } = useAppStore.getState();
        if (activeTabId) removeTab(activeTabId);
      } else if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        const state = useAppStore.getState();
        if (state.tabs.length < 2) return;
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
        const next = e.shiftKey
          ? (idx - 1 + state.tabs.length) % state.tabs.length
          : (idx + 1) % state.tabs.length;
        switchTab(state.tabs[next].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  // FileSystemObserver is experimental; Edge exposes it but crashes on use
  const supportsFileObserver =
    "FileSystemObserver" in window && !/\bEdg\//.test(navigator.userAgent);

  // Watch the active tab's open file for external changes
  const fileHandle = tab?.fileHandle ?? null;
  useEffect(() => {
    if (!fileHandle || !supportsFileObserver) return;
    const FSObserver = window.FileSystemObserver;
    if (!FSObserver) return;
    let observer: FileSystemObserver | null = null;
    try {
      observer = new FSObserver(
        (records: FileSystemObserverRecord[]) => {
          if (
            records.some((r) => r.type === "modified" || r.type === "appeared")
          ) {
            refreshFile();
          }
        },
      );
      observer.observe(fileHandle).catch((e: unknown) => {
        console.warn("[FileSystemObserver] file observe failed:", e);
      });
    } catch (e) {
      console.warn("[FileSystemObserver] file setup failed:", e);
      return;
    }
    return () => observer?.disconnect();
  }, [fileHandle, refreshFile]);

  // Watch the active tab's open directory for new/removed files
  const directoryHandle = tab?.directoryHandle ?? null;
  useEffect(() => {
    if (!directoryHandle || !supportsFileObserver) return;
    const FSObserver = window.FileSystemObserver;
    if (!FSObserver) return;
    let observer: FileSystemObserver | null = null;
    try {
      observer = new FSObserver(
        (records: FileSystemObserverRecord[]) => {
          if (
            records.some(
              (r) =>
                r.type === "appeared" ||
                r.type === "disappeared" ||
                r.type === "modified",
            )
          ) {
            refreshFileTree();
          }
        },
      );
      observer.observe(directoryHandle, { recursive: true }).catch((e: unknown) => {
        console.warn("[FileSystemObserver] directory observe failed:", e);
      });
    } catch (e) {
      console.warn("[FileSystemObserver] directory setup failed:", e);
      return;
    }
    return () => observer?.disconnect();
  }, [directoryHandle, refreshFileTree]);

  // ── Peer mode (full-screen takeover, no tabs) ──
  if (isPeerMode) {
    if (!peerModeChecked) return null;
    if (!peerName) return <PeerNamePrompt />;
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

  if (!peerModeChecked) return null;

  // ── No tabs open → show FilePicker ──
  if (tabs.length === 0) return <FilePicker />;

  // ── Host mode with tabs ──
  const hasFolderOpen = (tab?.fileTree.length ?? 0) > 0;

  return (
    <div className="app-layout">
      {!focusMode && (
        <Header
          onShare={() =>
            setShareScope({
              nodes: [],
              label: tab?.fileName ?? "document",
            })
          }
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
          {tab?.fileName ? <MarkdownRenderer /> : <NoFileSelected />}
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
