import "./FileTreeSidebar.css";
import { useState, type ReactNode } from "react";
import type { SidebarTreeNode } from "../../../types/fileTree";

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <span
      className={`tree-item__chevron${expanded ? " tree-item__chevron--expanded" : ""}`}
      aria-hidden="true"
    >
      ›
    </span>
  );
}

function FolderIcon() {
  return (
    <svg
      className="tree-item__folder-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
    </svg>
  );
}

interface TreeItemProps {
  node: SidebarTreeNode;
  depth: number;
  activeFilePath: string | null;
  onSelect: (path: string) => void;
  commentCounts: Record<string, number>;
}

function TreeItem({
  node,
  depth,
  activeFilePath,
  onSelect,
  commentCounts,
}: TreeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const depthClass = `tree-item--depth-${Math.min(depth, 2)}`;

  if (node.kind === "file") {
    const isActive = activeFilePath === node.path;
    return (
      <div className="tree-item-row">
        <button
          className={`tree-item tree-item--file ${depthClass}${isActive ? " tree-item--active" : ""}`}
          onClick={() => onSelect(node.path)}
          title={node.path}
        >
          <span className="tree-item__file-spacer" aria-hidden="true" />
          <span className="tree-item__name">{node.name}</span>
          {(commentCounts[node.path] ?? 0) > 0 && (
            <span className="tree-item__comment-count">
              {commentCounts[node.path]}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="tree-item-group">
      <div className="tree-item-row">
        <button
          className={`tree-item tree-item--dir ${depthClass}`}
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          <ChevronIcon expanded={expanded} />
          <FolderIcon />
          <span className="tree-item__name">{node.name}</span>
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
              commentCounts={commentCounts}
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
  commentCounts?: Record<string, number>;
  onCollapse?: () => void;
}

export function FileTreeSidebar({
  tree,
  activeFilePath,
  onSelect,
  header,
  commentCounts = {},
  onCollapse,
}: FileTreeSidebarProps) {
  return (
    <aside className="file-tree-sidebar">
      <div className="file-tree-header">
        <span className="file-tree-header__name" title={header.title}>
          {header.title}
        </span>
        <div className="file-tree-header__actions">
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
          {onCollapse && (
            <button
              className="file-tree-header__btn"
              onClick={onCollapse}
              title="Hide sidebar (⌘B)"
              aria-label="Hide sidebar"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="file-tree-scroll">
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            onSelect={onSelect}
            commentCounts={commentCounts}
          />
        ))}
      </div>
    </aside>
  );
}
