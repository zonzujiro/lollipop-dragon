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
  const [expanded, setExpanded] = useState(true);
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
        >
          <ChevronIcon expanded={expanded} />
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
