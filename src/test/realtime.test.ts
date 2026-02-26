import { describe, it, expect, vi, beforeEach } from 'vitest'
import { docIdToRoomId, generateRoomPassword } from '../services/realtime'

describe('realtime helpers', () => {
  it('docIdToRoomId produces deterministic room ID', () => {
    const roomId = docIdToRoomId('abc123def456ghi789')
    expect(roomId).toBe('mr-abc123def456ghi7')
    expect(docIdToRoomId('abc123def456ghi789')).toBe(roomId)
  })

  it('docIdToRoomId handles short doc IDs', () => {
    const roomId = docIdToRoomId('short')
    expect(roomId).toBe('mr-short')
  })

  it('generateRoomPassword returns 32-char hex string', () => {
    const pwd = generateRoomPassword()
    expect(pwd).toMatch(/^[0-9a-f]{32}$/)
  })

  it('generateRoomPassword produces unique values', () => {
    const a = generateRoomPassword()
    const b = generateRoomPassword()
    expect(a).not.toBe(b)
  })
})
