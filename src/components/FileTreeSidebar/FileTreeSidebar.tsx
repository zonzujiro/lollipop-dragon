import "./FileTreeSidebar.css";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SidebarTreeNode } from "../../types/fileTree";
import type { ShareRecord } from "../../types/share";

const MIN_WIDTH = 160;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 240;
const WIDTH_KEY = "markreview-sidebar-width";

function loadWidth(): number {
  try {
    const v = localStorage.getItem(WIDTH_KEY);
    if (v) {
      const n = Number(v);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) {
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transform: expanded ? "rotate(90deg)" : "none",
        transition: "transform 0.15s",
        flexShrink: 0,
      }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, opacity: 0.5 }}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function SharedBadge() {
  return (
    <span
      className="tree-item__shared-badge"
      title="Currently shared"
      aria-label="Shared"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </span>
  );
}

/** Compute whether this exact node has a share link */
function isNodeShared(node: SidebarTreeNode, shares: ShareRecord[]): boolean {
  if (shares.length === 0) {
    return false;
  }
  const now = new Date();
  return shares.some(
    (s) => new Date(s.expiresAt) > now && s.label === node.name,
  );
}

interface ContextMenuState {
  node: SidebarTreeNode;
  x: number;
  y: number;
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onShare?: (nodes: SidebarTreeNode[], label: string) => void;
}

function ContextMenu({ state, onClose, onShare }: ContextMenuProps) {
  const { node, x, y } = state;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    setPos({
      x: rect.right > window.innerWidth ? x - rect.width : x,
      y: rect.bottom > window.innerHeight ? y - rect.height : y,
    });
  }, [x, y]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    function handlePointerDown(e: PointerEvent) {
      if (!(e.target instanceof Node)) {
        return;
      }
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onClose]);

  async function handleCopyName() {
    await navigator.clipboard.writeText(node.name);
    onClose();
  }

  function handleShare() {
    if (!onShare) {
      return;
    }
    if (node.kind === "file") {
      onShare([node], node.name);
    } else {
      onShare(node.children, node.name);
    }
    onClose();
  }

  return (
    <div
      ref={ref}
      className="tree-context-menu"
      style={{ left: pos.x, top: pos.y }}
    >
      <button className="tree-context-menu__item" onClick={handleCopyName}>
        Copy name
      </button>
      {onShare && (
        <>
          <div className="tree-context-menu__separator" />
          <button className="tree-context-menu__item" onClick={handleShare}>
            Share
          </button>
        </>
      )}
    </div>
  );
}

interface TreeItemProps {
  node: SidebarTreeNode;
  depth: number;
  activeFilePath: string | null;
  onSelect: (path: string) => void;
  onShowContextMenu: (node: SidebarTreeNode, x: number, y: number) => void;
  shares: ShareRecord[];
}

function TreeItem({
  node,
  depth,
  activeFilePath,
  onSelect,
  onShowContextMenu,
  shares,
}: TreeItemProps) {
  const [expanded, setExpanded] = useState(true);
  const indent = depth * 1 + 0.75;
  const shared = isNodeShared(node, shares);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    onShowContextMenu(node, e.clientX, e.clientY);
  }

  if (node.kind === "file") {
    const isActive = activeFilePath === node.path;
    return (
      <div className="tree-item-row" onContextMenu={handleContextMenu}>
        <button
          className={`tree-item tree-item--file${isActive ? " tree-item--active" : ""}`}
          style={{ paddingLeft: `${indent}rem` }}
          onClick={() => onSelect(node.path)}
          title={node.path}
        >
          <FileIcon />
          <span className="tree-item__name">{node.name}</span>
          {shared && <SharedBadge />}
        </button>
      </div>
    );
  }

  return (
    <div className="tree-item-group">
      <div className="tree-item-row" onContextMenu={handleContextMenu}>
        <button
          className="tree-item tree-item--dir"
          style={{ paddingLeft: `${indent}rem` }}
          onClick={() => setExpanded((e) => !e)}
        >
          <ChevronIcon expanded={expanded} />
          <span className="tree-item__name">{node.name}</span>
          {shared && <SharedBadge />}
        </button>
      </div>
      {expanded && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              onSelect={onSelect}
              onShowContextMenu={onShowContextMenu}
              shares={shares}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export interface FileTreeSidebarProps {
  tree: SidebarTreeNode[];
  activeFilePath: string | null;
  onSelect: (path: string) => void;
  header: {
    title: string;
    action?: { onClick: () => void; label: string; icon: ReactNode };
  };
  onShare?: (nodes: SidebarTreeNode[], label: string) => void;
  shares?: ShareRecord[];
}

export function FileTreeSidebar({
  tree,
  activeFilePath,
  onSelect,
  header,
  onShare,
  shares = [],
}: FileTreeSidebarProps) {
  const [width, setWidth] = useState(loadWidth);
  const dragging = useRef(false);
  const latestWidth = useRef(width);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleShowContextMenu = useCallback(
    (node: SidebarTreeNode, x: number, y: number) => {
      setContextMenu({ node, x, y });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startW = width;

      const onMove = (ev: PointerEvent) => {
        const next = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startW + ev.clientX - startX),
        );
        latestWidth.current = next;
        setWidth(next);
      };
      const onUp = () => {
        dragging.current = false;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        try {
          localStorage.setItem(WIDTH_KEY, String(latestWidth.current));
        } catch {
          /* ignore */
        }
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [width],
  );

  return (
    <aside className="file-tree-sidebar" style={{ width }}>
      <div className="file-tree-header">
        <span className="file-tree-header__name" title={header.title}>
          {header.title}
        </span>
        {header.action && (
          <button
            className="file-tree-header__btn"
            onClick={header.action.onClick}
            title={header.action.label}
            aria-label={header.action.label}
          >
            {header.action.icon}
          </button>
        )}
      </div>
      <div className="file-tree-scroll">
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            onSelect={onSelect}
            onShowContextMenu={handleShowContextMenu}
            shares={shares}
          />
        ))}
      </div>
      <div
        className="file-tree-resize"
        onPointerDown={onPointerDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={handleCloseContextMenu}
          onShare={onShare}
        />
      )}
    </aside>
  );
}
