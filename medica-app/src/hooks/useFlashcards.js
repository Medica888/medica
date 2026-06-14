import { useState, useCallback, useEffect } from 'react'
import { getAllFlashcards, syncLocalFlashcardsToBackend } from '../lib/dataProvider.js'

// localStorage-primary read hook.
// Backend read is deferred to migration phase — the backend Flashcard type lacks the
// rich metadata fields (subject/system/topic/memoryAnchor/commonTrap/reviewCount) that
// drive Topic Intelligence, filters, and review card content. All writes already
// dual-write to localStorage + backend via dataProvider write functions.
export function useFlashcards() {
  const [cards, setCards] = useState(() => getAllFlashcards())

  useEffect(() => {
    syncLocalFlashcardsToBackend()
  }, [])

  const refresh = useCallback(() => {
    setCards(getAllFlashcards())
  }, [])

  return {
    cards,
    loading: false,
    error: null,
    source: 'localStorage',
    refresh,
  }
}
