import { useAppStore } from '../store'

export function FilePicker() {
  const openFile = useAppStore((s) => s.openFileInNewTab)
  const openDirectory = useAppStore((s) => s.openDirectoryInNewTab)

  return (
    <div className="file-picker">
      <div className="file-picker__card">
        <h1 className="file-picker__title">MarkReview</h1>
        <p className="file-picker__subtitle">
          Open a markdown file or folder to start reviewing
        </p>
        <div className="file-picker__actions">
          <button onClick={openFile} className="file-picker__btn">
            Open File
          </button>
          <button onClick={openDirectory} className="file-picker__btn file-picker__btn--secondary">
            Open Folder
          </button>
        </div>
      </div>
    </div>
  )
}
