import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useFlashcards } from './useFlashcards.js'

vi.mock('../lib/dataProvider.js', () => ({
  getAllFlashcards:              vi.fn(() => []),
  saveFlashcards:               vi.fn(async () => ({ added: 0, skipped: 0, total: 0 })),
  reviewFlashcard:              vi.fn(async () => {}),
  clearFlashcards:              vi.fn(async () => {}),
  syncLocalFlashcardsToBackend: vi.fn(async () => ({ skipped: true, reason: 'already synced' })),
  getBackendFlashcards:         vi.fn(async () => null),
  importBackendFlashcards:      vi.fn(() => 0),
}))

import {
  getAllFlashcards,
  syncLocalFlashcardsToBackend,
  getBackendFlashcards,
  importBackendFlashcards,
} from '../lib/dataProvider.js'

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

  it('source starts as localStorage', () => {
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

  it('does not re-fetch backend on refresh (refresh reads localStorage only)', () => {
    getAllFlashcards.mockReturnValue([])
    const { result } = renderHook(() => useFlashcards())
    const callsBefore = getBackendFlashcards.mock.calls.length
    act(() => result.current.refresh())
    expect(getBackendFlashcards.mock.calls.length).toBe(callsBefore)
  })
})

describe('useFlashcards — backend read', () => {
  beforeEach(() => vi.clearAllMocks())

  it('source transitions to backend when getBackendFlashcards returns cards', async () => {
    const backendCards = [makeCard('uuid-1')]
    getBackendFlashcards.mockResolvedValue(backendCards)
    getAllFlashcards.mockReturnValue(backendCards)

    const { result } = renderHook(() => useFlashcards())
    expect(result.current.source).toBe('localStorage')

    await waitFor(() => {
      expect(result.current.source).toBe('backend')
    })
  })

  it('updates cards state after importing backend cards', async () => {
    const backendCards = [makeCard('uuid-1'), makeCard('uuid-2')]
    getBackendFlashcards.mockResolvedValue(backendCards)
    getAllFlashcards
      .mockReturnValueOnce([])
      .mockReturnValue(backendCards)

    const { result } = renderHook(() => useFlashcards())

    await waitFor(() => {
      expect(result.current.cards).toEqual(backendCards)
    })
  })

  it('calls importBackendFlashcards with the fetched cards', async () => {
    const backendCards = [makeCard('uuid-1')]
    getBackendFlashcards.mockResolvedValue(backendCards)
    getAllFlashcards.mockReturnValue(backendCards)

    renderHook(() => useFlashcards())

    await waitFor(() => {
      expect(importBackendFlashcards).toHaveBeenCalledWith(backendCards)
    })
  })

  it('source stays localStorage when backend returns null', async () => {
    getBackendFlashcards.mockResolvedValue(null)
    getAllFlashcards.mockReturnValue([makeCard('local-1')])

    const { result } = renderHook(() => useFlashcards())

    await waitFor(() => expect(syncLocalFlashcardsToBackend).toHaveBeenCalled())
    expect(result.current.source).toBe('localStorage')
    expect(importBackendFlashcards).not.toHaveBeenCalled()
  })

  it('source stays localStorage when backend returns empty array', async () => {
    getBackendFlashcards.mockResolvedValue([])
    getAllFlashcards.mockReturnValue([makeCard('local-1')])

    const { result } = renderHook(() => useFlashcards())

    await waitFor(() => expect(syncLocalFlashcardsToBackend).toHaveBeenCalled())
    expect(result.current.source).toBe('localStorage')
    expect(importBackendFlashcards).not.toHaveBeenCalled()
  })

  it('refresh resets source to localStorage after backend read', async () => {
    const backendCards = [makeCard('uuid-1')]
    getBackendFlashcards.mockResolvedValue(backendCards)
    getAllFlashcards.mockReturnValue(backendCards)

    const { result } = renderHook(() => useFlashcards())

    await waitFor(() => {
      expect(result.current.source).toBe('backend')
    })

    act(() => result.current.refresh())
    expect(result.current.source).toBe('localStorage')
  })
})
