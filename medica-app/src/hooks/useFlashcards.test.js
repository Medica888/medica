import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFlashcards } from './useFlashcards.js'

vi.mock('../lib/dataProvider.js', () => ({
  getAllFlashcards:              vi.fn(() => []),
  saveFlashcards:               vi.fn(async () => ({ added: 0, skipped: 0, total: 0 })),
  reviewFlashcard:              vi.fn(async () => {}),
  clearFlashcards:              vi.fn(async () => {}),
  syncLocalFlashcardsToBackend: vi.fn(async () => ({ skipped: true, reason: 'already synced' })),
}))

import { getAllFlashcards, syncLocalFlashcardsToBackend } from '../lib/dataProvider.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeCard(id = 'fc-1') {
  return { id, front: `Front ${id}`, back: `Back ${id}`, reviewStatus: 'new' }
}

// ── Hook tests ───────────────────────────────────────────────────────────────

describe('useFlashcards — initial state', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns cards from getAllFlashcards on init', () => {
    const mockCards = [makeCard('fc-1')]
    getAllFlashcards.mockReturnValue(mockCards)
    const { result } = renderHook(() => useFlashcards())
    expect(result.current.cards).toEqual(mockCards)
  })

  it('returns empty array when no cards exist', () => {
    getAllFlashcards.mockReturnValue([])
    const { result } = renderHook(() => useFlashcards())
    expect(result.current.cards).toEqual([])
  })

  it('loading is always false (localStorage reads are synchronous)', () => {
    const { result } = renderHook(() => useFlashcards())
    expect(result.current.loading).toBe(false)
  })

  it('error is always null', () => {
    const { result } = renderHook(() => useFlashcards())
    expect(result.current.error).toBeNull()
  })

  it('source is always localStorage', () => {
    const { result } = renderHook(() => useFlashcards())
    expect(result.current.source).toBe('localStorage')
  })

  it('calls getAllFlashcards exactly once on mount', () => {
    getAllFlashcards.mockReturnValue([])
    renderHook(() => useFlashcards())
    expect(getAllFlashcards).toHaveBeenCalledTimes(1)
  })
})

describe('useFlashcards — refresh()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('re-reads from getAllFlashcards and updates cards', () => {
    getAllFlashcards.mockReturnValue([])
    const { result } = renderHook(() => useFlashcards())
    expect(result.current.cards).toEqual([])

    const newCards = [makeCard('fc-2')]
    getAllFlashcards.mockReturnValue(newCards)
    act(() => result.current.refresh())
    expect(result.current.cards).toEqual(newCards)
  })

  it('calling refresh multiple times reads latest state each time', () => {
    getAllFlashcards.mockReturnValueOnce([]).mockReturnValueOnce([makeCard('a')]).mockReturnValueOnce([makeCard('a'), makeCard('b')])
    const { result } = renderHook(() => useFlashcards())
    act(() => result.current.refresh())
    expect(result.current.cards).toHaveLength(1)
    act(() => result.current.refresh())
    expect(result.current.cards).toHaveLength(2)
  })

  it('refresh is referentially stable across re-renders', () => {
    getAllFlashcards.mockReturnValue([])
    const { result, rerender } = renderHook(() => useFlashcards())
    const firstRefresh = result.current.refresh
    rerender()
    expect(result.current.refresh).toBe(firstRefresh)
  })
})

describe('useFlashcards — no backend calls', () => {
  beforeEach(() => vi.clearAllMocks())

  it('never calls saveFlashcards, reviewFlashcard, or clearFlashcards on mount', async () => {
    const { saveFlashcards, reviewFlashcard, clearFlashcards } = await import('../lib/dataProvider.js')
    getAllFlashcards.mockReturnValue([])
    renderHook(() => useFlashcards())
    expect(saveFlashcards).not.toHaveBeenCalled()
    expect(reviewFlashcard).not.toHaveBeenCalled()
    expect(clearFlashcards).not.toHaveBeenCalled()
  })
})

describe('useFlashcards — sync on mount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls syncLocalFlashcardsToBackend once on mount', () => {
    getAllFlashcards.mockReturnValue([])
    renderHook(() => useFlashcards())
    expect(syncLocalFlashcardsToBackend).toHaveBeenCalled()
  })

  it('does not re-trigger sync on refresh', () => {
    getAllFlashcards.mockReturnValue([])
    const { result } = renderHook(() => useFlashcards())
    const callsBefore = syncLocalFlashcardsToBackend.mock.calls.length
    act(() => result.current.refresh())
    expect(syncLocalFlashcardsToBackend.mock.calls.length).toBe(callsBefore)
  })
})
