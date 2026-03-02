import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { UndoToast } from '../components/UndoToast'
import { useAppStore } from '../store'
import { setTestState, resetTestStore } from './testHelpers'

beforeEach(() => {
  resetTestStore()
  setTestState({ undoState: null })
  vi.restoreAllMocks()
})

describe('UndoToast', () => {
  it('is not rendered when undoState is null', () => {
    render(<UndoToast />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('appears when undoState is set', () => {
    setTestState({ undoState: { rawContent: 'old content' } })
    render(<UndoToast />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('calls store.undo when Undo button is clicked', async () => {
    const user = userEvent.setup()
    const mockUndo = vi.fn().mockResolvedValue(undefined)
    setTestState({ undoState: { rawContent: 'old' } })
    useAppStore.setState({ undo: mockUndo })
    render(<UndoToast />)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(mockUndo).toHaveBeenCalledOnce()
  })

  it('calls store.clearUndo when Dismiss button is clicked', async () => {
    const user = userEvent.setup()
    const mockClear = vi.fn()
    setTestState({ undoState: { rawContent: 'old' } })
    useAppStore.setState({ clearUndo: mockClear })
    render(<UndoToast />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(mockClear).toHaveBeenCalledOnce()
  })

  it('auto-dismisses after 5 seconds', () => {
    vi.useFakeTimers()
    const mockClear = vi.fn()
    setTestState({ undoState: { rawContent: 'old' } })
    useAppStore.setState({ clearUndo: mockClear })
    render(<UndoToast />)
    act(() => vi.advanceTimersByTime(5000))
    expect(mockClear).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
