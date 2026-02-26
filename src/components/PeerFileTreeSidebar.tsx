import { useState } from 'react'
import { useAppStore } from '../store'

interface VirtualFileNode {
  kind: 'file'
  name: string
  path: string
}

interface VirtualDirNode {
  kind: 'directory'
  name: string
  path: string
  children: VirtualTreeNode[]
}

type VirtualTreeNode = VirtualFileNode | VirtualDirNode

/** Build a nested tree from flat path keys like "folder/sub/file.md" */
function buildVirtualTree(paths: string[]): VirtualTreeNode[] {
  const root: VirtualDirNode = { kind: 'directory', name: '', path: '', children: [] }

  for (const path of paths) {
    const parts = path.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const subPath = parts.slice(0, i + 1).join('/')
      if (i === parts.length - 1) {
        current.children.push({ kind: 'file', name, path })
      } else {
        let dir = current.children.find(
          (c) => c.kind === 'directory' && c.name === name,
        ) as VirtualDirNode | undefined
        if (!dir) {
          dir = { kind: 'directory', name, path: subPath, children: [] }
          current.children.push(dir)
        }
        current = dir
      }
    }
  }

  // Sort: directories first, then alphabetical
  function sortNodes(nodes: VirtualTreeNode[]): VirtualTreeNode[] {
    return nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    }).map((n) => {
      if (n.kind === 'directory') return { ...n, children: sortNodes(n.children) }
      return n
    })
  }

  return sortNodes(root.children)
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

interface TreeItemProps {
  node: VirtualTreeNode
  depth: number
  activeFilePath: string | null
  onSelect: (path: string) => void
}

function TreeItem({ node, depth, activeFilePath, onSelect }: TreeItemProps) {
  const [expanded, setExpanded] = useState(true)
  const indent = depth * 1 + 0.75

  if (node.kind === 'file') {
    const isActive = activeFilePath === node.path
    return (
      <div className="tree-item-row">
        <button
          className={`tree-item tree-item--file${isActive ? ' tree-item--active' : ''}`}
          style={{ paddingLeft: `${indent}rem` }}
          onClick={() => onSelect(node.path)}
          title={node.path}
        >
          <FileIcon />
          <span className="tree-item__name">{node.name}</span>
        </button>
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function PeerFileTreeSidebar() {
  const sharedContent = useAppStore((s) => s.sharedContent)
  const activeFilePath = useAppStore((s) => s.activeFilePath)
  const selectPeerFile = useAppStore((s) => s.selectPeerFile)

  if (!sharedContent) return null

  const paths = Object.keys(sharedContent.tree)
  if (paths.length <= 1) return null

  const tree = buildVirtualTree(paths)

  return (
    <aside className="file-tree-sidebar">
      <div className="file-tree-header">
        <span className="file-tree-header__name">Shared files</span>
      </div>
      <div className="file-tree-scroll">
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            onSelect={selectPeerFile}
          />
        ))}
      </div>
    </aside>
  )
}
