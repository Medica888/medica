import { useState, useCallback, useEffect } from 'react'
import {
  getAllFlashcards,
  syncLocalFlashcardsToBackend,
  getBackendFlashcards,
  importBackendFlashcards,
} from '../lib/dataProvider.js'

export function useFlashcards() {
  const [cards, setCards] = useState(() => getAllFlashcards())
  const [source, setSource] = useState('localStorage')

  useEffect(() => {
    let cancelled = false
    async function syncAndLoad() {
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
  }, [])

  const refresh = useCallback(() => {
    setCards(getAllFlashcards())
    setSource('localStorage')
  }, [])

  return { cards, loading: false, error: null, source, refresh }
}
