import { type ComponentPropsWithoutRef, useEffect, useState, Children, isValidElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { rehypeShikiFromHighlighter } from '@shikijs/rehype'
import { createHighlighter, type Highlighter } from 'shiki'
import { MermaidBlock } from './MermaidBlock'
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

// Override <pre> to detect mermaid blocks (which Shiki skips as unknown lang)
// and route them to MermaidBlock instead of a plain <pre>.
function PreBlock({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  const child = Children.toArray(children)[0]
  if (
    isValidElement(child) &&
    typeof child.props === 'object' &&
    child.props !== null &&
    'className' in child.props &&
    typeof child.props.className === 'string' &&
    child.props.className.includes('language-mermaid')
  ) {
    const code = String((child.props as { children?: unknown }).children ?? '').replace(/\n$/, '')
    return <MermaidBlock code={code} />
  }
  return <pre {...props}>{children}</pre>
}

export function MarkdownRenderer() {
  const rawContent = useAppStore((s) => s.rawContent)
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null)

  useEffect(() => {
    getHighlighter().then(setHighlighter)
  }, [])

  const rehypePlugins = highlighter
    ? ([[rehypeShikiFromHighlighter, highlighter, { theme: 'github-light', missingLang: 'ignore' }]] as const)
    : []

  return (
    <div className="h-full overflow-auto px-8 py-10">
      <div className="markdown-body mx-auto max-w-[720px]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={rehypePlugins}
          components={{ pre: PreBlock }}
        >
          {rawContent}
        </ReactMarkdown>
      </div>
    </div>
  )
}
