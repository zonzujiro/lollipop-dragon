import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAppStore } from '../store'

export function MarkdownRenderer() {
  const rawContent = useAppStore((s) => s.rawContent)

  return (
    <div className="h-full overflow-auto px-8 py-10">
      <div className="markdown-body mx-auto max-w-[720px]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{rawContent}</ReactMarkdown>
      </div>
    </div>
  )
}
