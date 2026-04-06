import './PeerNamePrompt.css'
import { useState } from 'react'
import { useAppStore } from '../../../store'

export function PeerNamePrompt() {
  const setPeerName = useAppStore((s) => s.setPeerName)
  const [name, setName] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      return
    }
    setPeerName(trimmed)
  }

  return (
    <div className="peer-prompt__overlay" role="dialog" aria-modal="true" aria-label="Enter your name">
      <div className="peer-prompt">
        <div className="peer-prompt__dragon" aria-hidden="true">🐉</div>
        <h2 className="peer-prompt__title">You've been invited to review a document</h2>
        <p className="peer-prompt__desc">
          Enter your name so the author knows who left the comments.
        </p>
        <form onSubmit={handleSubmit} className="peer-prompt__form">
          <input
            className="peer-prompt__input"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            aria-label="Your name"
          />
          <button
            className="peer-prompt__btn"
            type="submit"
            disabled={!name.trim()}
          >
            Start reviewing
          </button>
        </form>
      </div>
    </div>
  )
}
