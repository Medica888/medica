import { useState, useCallback } from 'react'

/**
 * State keyed by question id (notes, highlights, eliminated options, ...),
 * seeded from a saved session. Returns [byQuestion, update], where
 * update(questionId, fn) replaces that question's value with fn(currentValue).
 * currentValue is undefined until the question has an entry.
 *
 * @template T
 * @param {Record<string, T> | undefined} initial
 * @returns {[Record<string, T>, (questionId: string, fn: (current: T | undefined) => T) => void]}
 */
export function usePerQuestionState(initial) {
  const [byQuestion, setByQuestion] = useState(() => ({ ...(initial || {}) }))

  const update = useCallback((questionId, fn) => {
    setByQuestion(prev => ({ ...prev, [questionId]: fn(prev[questionId]) }))
  }, [])

  return [byQuestion, update]
}
