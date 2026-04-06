import { useActiveTab } from '../../../store/selectors'

export function RawViewer() {
  const rawContent = useActiveTab()?.rawContent ?? ''

  return (
    <pre className="h-full overflow-auto p-6 text-sm leading-relaxed text-stone-700 whitespace-pre-wrap break-words font-mono">
      {rawContent}
    </pre>
  )
}
