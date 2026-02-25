import { useAppStore } from './store'
import { FilePicker } from './components/FilePicker'
import { Header } from './components/Header'
import { RawViewer } from './components/RawViewer'

function App() {
  const fileHandle = useAppStore((s) => s.fileHandle)

  if (!fileHandle) {
    return <FilePicker />
  }

  return (
    <div className="flex h-screen flex-col bg-stone-50">
      <Header />
      <main className="flex-1 overflow-hidden">
        <RawViewer />
      </main>
    </div>
  )
}

export default App
