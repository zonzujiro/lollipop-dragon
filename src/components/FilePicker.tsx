import { useAppStore } from '../store'

export function FilePicker() {
  const openFile = useAppStore((s) => s.openFile)

  return (
    <div className="file-picker">
      <div style={{ textAlign: 'center' }}>
        <h1 className="file-picker__title">MarkReview</h1>
        <p className="file-picker__subtitle">Open a markdown file to start reviewing</p>
      </div>
      <button onClick={openFile} className="file-picker__btn">
        Open File
      </button>
    </div>
  )
}
