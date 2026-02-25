import { useAppStore } from '../store'

export function RawViewer() {
  const rawContent = useAppStore((s) => s.rawContent)

  return (
    <pre className="h-full overflow-auto p-6 text-sm leading-relaxed text-stone-700 whitespace-pre-wrap break-words font-mono">
      {rawContent}
    </pre>
  )
}
