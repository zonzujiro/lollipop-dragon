import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })

interface Props {
  code: string
}

export function MermaidBlock({ code }: Props) {
  const uid = useId().replace(/:/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setError(null)

    mermaid
      .render(`mermaid-${uid}`, code)
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
  }, [code, uid])

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

  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
}
