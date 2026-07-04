import { useState, useCallback, useEffect, useRef } from 'react'
import {
  getAllFlashcards,
  syncLocalFlashcardsToBackend,
  getBackendFlashcards,
  importBackendFlashcards,
} from '../lib/dataProvider.js'
import { useAuthState } from './useAuthState.js'

export function useFlashcards() {
  const authState = useAuthState()
  const [cards, setCards] = useState(() => getAllFlashcards())
  const [source, setSource] = useState('localStorage')
  const previousScopeRef = useRef(authState.scopeKey)

  useEffect(() => {
    let cancelled = false
    const scopeChanged = previousScopeRef.current !== authState.scopeKey
    previousScopeRef.current = authState.scopeKey

    async function syncAndLoad() {
      if (scopeChanged) {
        await Promise.resolve()
        if (cancelled) return
        setCards(getAllFlashcards())
        setSource('localStorage')
      }

      if (!authState.isAuthenticated) return

      await syncLocalFlashcardsToBackend()
      const backendCards = await getBackendFlashcards()
      if (cancelled) return
      if (backendCards !== null && backendCards.length > 0) {
        importBackendFlashcards(backendCards)
        setCards(getAllFlashcards())
        setSource('backend')
      }
    }
    syncAndLoad()
    return () => { cancelled = true }
  }, [authState.isAuthenticated, authState.scopeKey])

  const refresh = useCallback(() => {
    setCards(getAllFlashcards())
    setSource('localStorage')
  }, [])

  return { cards, loading: false, error: null, source, refresh }
}
