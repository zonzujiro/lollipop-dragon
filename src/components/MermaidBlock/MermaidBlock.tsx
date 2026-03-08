import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })

// Matches the direction token in: graph TD, graph LR, flowchart TD, flowchart LR, etc.
const DIR_RE = /^((?:graph|flowchart)\s+)(TD|LR|TB|RL|BT)(\b.*)/i

type Direction = 'TD' | 'LR'

function parseDirection(code: string): Direction | null {
  const match = DIR_RE.exec(code.trimStart())
  if (!match) return null
  const dir = match[2].toUpperCase()
  // Normalise TB → TD (both mean top-to-bottom)
  return dir === 'TB' ? 'TD' : dir === 'TD' ? 'TD' : dir === 'LR' ? 'LR' : null
}

function setDirection(code: string, dir: Direction): string {
  return code.replace(DIR_RE, `$1${dir}$3`)
}

interface Props {
  code: string
}

export function MermaidBlock({ code }: Props) {
  const uid = useId().replace(/:/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirOverride, setDirOverride] = useState<Direction | null>(null)

  const originalDir = parseDirection(code)
  const effectiveCode =
    dirOverride && originalDir ? setDirection(code, dirOverride) : code
  const currentDir = dirOverride ?? originalDir
  const nextDir: Direction | null =
    currentDir === 'TD' ? 'LR' : currentDir === 'LR' ? 'TD' : null

  useEffect(() => {
    // Reset override when the source diagram changes
    setDirOverride(null)
  }, [code])

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setError(null)

    mermaid
      .render(`mermaid-${uid}`, effectiveCode)
      .then(({ svg: result }) => {
        if (!cancelled) setSvg(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Invalid diagram syntax')
        }
      })

    return () => {
      cancelled = true
    }
  }, [effectiveCode, uid])

  if (error) {
    return (
      <div className="mermaid-error">
        <pre>
          <code>{code}</code>
        </pre>
        <p className="mermaid-error-msg">Mermaid error: {error}</p>
      </div>
    )
  }

  if (!svg) return null

  return (
    <div className="mermaid-diagram">
      {nextDir && (
        <button
          className="mermaid-dir-btn"
          onClick={() => setDirOverride(nextDir)}
          title={`Switch to ${nextDir} layout`}
          aria-label={`Switch to ${nextDir} layout`}
        >
          {nextDir}
        </button>
      )}
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  )
}
