import { useState } from 'react'
import { useAppStore } from '../store'
import { ShareDialog } from './ShareDialog'
import type { FileTreeNode, FileNode, DirectoryNode } from '../types/fileTree'

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string | undefined

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
      style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
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
  )
}

function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </svg>
  )
}

interface TreeItemProps {
  node: FileTreeNode
  depth: number
  activeFilePath: string | null
  onSelect: (node: FileNode) => void
  onShare: (scope: FileTreeNode[], label: string) => void
}

function TreeItem({ node, depth, activeFilePath, onSelect, onShare }: TreeItemProps) {
  const [expanded, setExpanded] = useState(true)
  const indent = depth * 1 + 0.75

  function handleShare(e: React.MouseEvent) {
    e.stopPropagation()
    if (node.kind === 'file') {
      onShare([node], node.name)
    } else {
      onShare((node as DirectoryNode).children, node.name)
    }
  }

  if (node.kind === 'file') {
    const isActive = activeFilePath === node.path
    return (
      <div className="tree-item-row">
        <button
          className={`tree-item tree-item--file${isActive ? ' tree-item--active' : ''}`}
          style={{ paddingLeft: `${indent}rem` }}
          onClick={() => onSelect(node)}
          title={node.path}
        >
          <FileIcon />
          <span className="tree-item__name">{node.name}</span>
        </button>
        {WORKER_URL && (
          <button
            className="tree-item-share-btn"
            onClick={handleShare}
            title={`Share ${node.name}`}
            aria-label={`Share ${node.name}`}
          >
            <ShareIcon />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="tree-item-group">
      <div className="tree-item-row">
        <button
          className="tree-item tree-item--dir"
          style={{ paddingLeft: `${indent}rem` }}
          onClick={() => setExpanded((e) => !e)}
        >
          <ChevronIcon expanded={expanded} />
          <span className="tree-item__name">{node.name}</span>
        </button>
        {WORKER_URL && (
          <button
            className="tree-item-share-btn"
            onClick={handleShare}
            title={`Share ${node.name}`}
            aria-label={`Share ${node.name}`}
          >
            <ShareIcon />
          </button>
        )}
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
              onShare={onShare}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTreeSidebar() {
  const directoryName = useAppStore((s) => s.directoryName)
  const fileTree = useAppStore((s) => s.fileTree)
  const activeFilePath = useAppStore((s) => s.activeFilePath)
  const selectFile = useAppStore((s) => s.selectFile)
  const openDirectory = useAppStore((s) => s.openDirectory)

  const [shareScope, setShareScope] = useState<{ nodes: FileTreeNode[]; label: string } | null>(null)

  function handleShare(nodes: FileTreeNode[], label: string) {
    setShareScope({ nodes, label })
  }

  return (
    <aside className="file-tree-sidebar">
      <div className="file-tree-header">
        <span className="file-tree-header__name" title={directoryName ?? ''}>
          {directoryName}
        </span>
        <button
          className="file-tree-header__btn"
          onClick={openDirectory}
          title="Open another folder"
          aria-label="Open another folder"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
        </button>
      </div>
      <div className="file-tree-scroll">
        {fileTree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            onSelect={selectFile}
            onShare={handleShare}
          />
        ))}
      </div>
      {shareScope && (
        <ShareDialog
          onClose={() => setShareScope(null)}
          scope={shareScope.nodes}
          scopeLabel={shareScope.label}
        />
      )}
    </aside>
  )
}
