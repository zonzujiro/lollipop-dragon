import { useAppStore } from '../store'

export function FilePicker() {
  const openFile = useAppStore((s) => s.openFile)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-stone-50">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-stone-800">MarkReview</h1>
        <p className="mt-2 text-sm text-stone-500">
          Open a markdown file to start reviewing
        </p>
      </div>
      <button
        onClick={openFile}
        className="rounded-md bg-stone-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2"
      >
        Open File
      </button>
    </div>
  )
}
