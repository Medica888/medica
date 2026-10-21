import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePerQuestionState } from './usePerQuestionState'

describe('usePerQuestionState', () => {
  it('starts empty when there is no saved value', () => {
    const { result } = renderHook(() => usePerQuestionState(undefined))
    expect(result.current[0]).toEqual({})
  })

  it('seeds from a saved session without sharing its reference', () => {
    const saved = { q1: ['A'] }
    const { result } = renderHook(() => usePerQuestionState(saved))
    expect(result.current[0]).toEqual(saved)
    expect(result.current[0]).not.toBe(saved)
  })

  it('updates one question and leaves the others untouched', () => {
    const { result } = renderHook(() => usePerQuestionState({ q1: 'x', q2: 'y' }))
    act(() => result.current[1]('q1', cur => `${cur}!`))
    expect(result.current[0]).toEqual({ q1: 'x!', q2: 'y' })
  })

  it('passes undefined to the updater for a question with no entry', () => {
    const { result } = renderHook(() => usePerQuestionState({}))
    act(() => result.current[1]('q9', cur => [...(cur || []), 'B']))
    expect(result.current[0]).toEqual({ q9: ['B'] })
  })

  it('applies back-to-back updates in order', () => {
    const { result } = renderHook(() => usePerQuestionState({}))
    act(() => {
      result.current[1]('q1', cur => [...(cur || []), 'A'])
      result.current[1]('q1', cur => [...(cur || []), 'B'])
    })
    expect(result.current[0]).toEqual({ q1: ['A', 'B'] })
  })

  it('keeps a stable update function across renders', () => {
    const { result, rerender } = renderHook(() => usePerQuestionState({}))
    const first = result.current[1]
    rerender()
    expect(result.current[1]).toBe(first)
  })
})
