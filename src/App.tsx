import { useAppStore } from './store'
import { FilePicker } from './components/FilePicker'
import { Header } from './components/Header'
import { MarkdownRenderer } from './components/MarkdownRenderer'

function App() {
  const fileHandle = useAppStore((s) => s.fileHandle)

  if (!fileHandle) {
    return <FilePicker />
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-hidden">
        <MarkdownRenderer />
      </main>
    </div>
  )
}

export default App
