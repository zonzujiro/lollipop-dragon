import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { rehypeShikiFromHighlighter } from '@shikijs/rehype'
import { createHighlighter, type Highlighter } from 'shiki'
import { useAppStore } from '../store'

// Singleton — created once, shared across all renders
let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light'],
      langs: [
        'javascript', 'typescript', 'tsx', 'jsx',
        'python', 'bash', 'sh', 'json', 'yaml',
        'css', 'html', 'markdown', 'sql',
        'rust', 'go', 'java', 'c', 'cpp',
      ],
    })
  }
  return highlighterPromise
}

export function MarkdownRenderer() {
  const rawContent = useAppStore((s) => s.rawContent)
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null)

  useEffect(() => {
    getHighlighter().then(setHighlighter)
  }, [])

  const rehypePlugins = highlighter
    ? ([[rehypeShikiFromHighlighter, highlighter, { theme: 'github-light' }]] as const)
    : []

  return (
    <div className="h-full overflow-auto px-8 py-10">
      <div className="markdown-body mx-auto max-w-[720px]">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins}>
          {rawContent}
        </ReactMarkdown>
      </div>
    </div>
  )
}
