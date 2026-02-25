import { useAppStore } from '../store'

export function Header() {
  const fileName = useAppStore((s) => s.fileName)
  const openFile = useAppStore((s) => s.openFile)

  return (
    <header className="flex h-12 items-center justify-between border-b border-stone-200 bg-white px-4">
      <span className="text-sm font-medium text-stone-900">{fileName}</span>
      <button
        onClick={openFile}
        className="text-sm text-stone-500 hover:text-stone-800 focus:outline-none"
      >
        Open another file
      </button>
    </header>
  )
}
