import { useState, useEffect, useCallback, useRef } from 'react'
import { qbank } from '../lib/apiClient.js'
import { getBrowsableQuestionBank } from '../lib/mockQuestions.js'
import { useAuthState } from './useAuthState.js'

const PAGE_LIMIT = 100
const MAX_QUESTIONS = 2000
const SEARCH_DEBOUNCE_MS = 300

async function fetchAllCatalogQuestions(search) {
  const all = []
  let page = 1

  while (all.length < MAX_QUESTIONS) {
    const { data, totalPages } = await qbank.catalog({ page, limit: PAGE_LIMIT, search })
    if (!Array.isArray(data) || data.length === 0) break
    all.push(...data)
    if (page >= totalPages) break
    page++
  }

  return all.slice(0, MAX_QUESTIONS)
}

/**
 * Backend-driven QBank catalog: fetches the authored, answer-stripped question set
 * when backend mode and auth are available. Falls back to the bundled local question
 * bank on failure, or whenever backend mode/auth isn't ready — `source` tells callers
 * which happened ('backend' | 'local' | 'fallback' | 'restoring'), since only 'backend'
 * results need POST /api/qbank/sessions to resolve full bodies.
 *
 * `search` is debounced and passed through to the backend so a search narrows the
 * fetched set server-side instead of always downloading the full catalog to filter
 * client-side; with no search term this still walks every page (unchanged default
 * browse behavior).
 */
export function useQBankCatalog(search = '') {
  const useBackend = import.meta.env.VITE_USE_BACKEND === 'true'
  const authState  = useAuthState()
  const isReady    = useBackend && (authState.isRestoring || authState.isAuthenticated)

  const [questions, setQuestions] = useState(() => (isReady ? [] : getBrowsableQuestionBank()))
  const [loading, setLoading]     = useState(isReady)
  const [error, setError]         = useState(null)
  const [source, setSource]       = useState(authState.isRestoring && useBackend ? 'restoring' : isReady ? 'backend' : 'local')
  const [debouncedSearch, setDebouncedSearch] = useState(search)

  // Request ids prevent a previous user's slower request from overwriting current state.
  const requestRef = useRef({ id: 0, scopeKey: '' })

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const refresh = useCallback(() => {
    const requestId = requestRef.current.id + 1
    const requestScope = authState.scopeKey
    requestRef.current = { id: requestId, scopeKey: requestScope }
    const isCurrentRequest = () => (
      requestRef.current.id === requestId
      && requestRef.current.scopeKey === requestScope
    )

    if (!useBackend) {
      setQuestions(getBrowsableQuestionBank())
      setSource('local')
      setError(null)
      setLoading(false)
      return
    }
    if (authState.isRestoring) {
      setSource('restoring')
      setError(null)
      setLoading(true)
      return
    }
    if (!authState.isAuthenticated) {
      setQuestions(getBrowsableQuestionBank())
      setSource('local')
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    fetchAllCatalogQuestions(debouncedSearch)
      .then(data => {
        if (!isCurrentRequest()) return
        setQuestions(data)
        setSource('backend')
      })
      .catch(err => {
        if (!isCurrentRequest()) return
        console.warn('[useQBankCatalog] Backend fetch failed, falling back:', err.message)
        setQuestions(getBrowsableQuestionBank())
        setSource('fallback')
        setError(err.message)
      })
      .finally(() => {
        if (isCurrentRequest()) setLoading(false)
      })
  }, [useBackend, authState.isAuthenticated, authState.isRestoring, authState.scopeKey, debouncedSearch])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    return () => {
      requestRef.current = { ...requestRef.current, id: requestRef.current.id + 1 }
    }
  }, [refresh])

  return { questions, loading, error, source, refresh }
}
