import { useState, useEffect, useCallback, useRef } from 'react'
import { getSessionHistory } from '../lib/storage.js'
import { normalizeBackendSession, fetchAllBackendSessions } from '../lib/sessionNormalizer.js'
import { useAuthState } from './useAuthState.js'

export { normalizeBackendSession }

// ── Hook ──────────────────────────────────────────────────────────────────

export function useSessionHistory() {
  // Evaluate at call time so vi.stubEnv works in tests and hot-reloading is safe.
  // Both flags must be true: VITE_USE_BACKEND gates the write path in dataProvider
  // — if backend writes are disabled the backend has no data, so reads must also stay local.
  const useBackend = import.meta.env.VITE_USE_BACKEND === 'true'
  const authState  = useAuthState()
  const isReady    = useBackend && (authState.isRestoring || authState.isAuthenticated)

  const [sessions, setSessions] = useState(getSessionHistory)
  const [loading, setLoading]   = useState(isReady)
  const [error, setError]       = useState(null)
  const [source, setSource]     = useState(authState.isRestoring && useBackend ? 'restoring' : isReady ? 'backend' : 'localStorage')

  // Request ids prevent a previous user's slower request from overwriting current state.
  const requestRef = useRef({ id: 0, scopeKey: '' })

  const refresh = useCallback(() => {
    const requestId = requestRef.current.id + 1
    const requestScope = authState.scopeKey
    requestRef.current = { id: requestId, scopeKey: requestScope }
    const isCurrentRequest = () => (
      requestRef.current.id === requestId
      && requestRef.current.scopeKey === requestScope
    )
    const backendEnabled = import.meta.env.VITE_USE_BACKEND === 'true'
    if (!backendEnabled) {
      setSessions(getSessionHistory())
      setSource('localStorage')
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
      setSessions(getSessionHistory())
      setSource('localStorage')
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    fetchAllBackendSessions()
      .then(data => {
        if (!isCurrentRequest()) return
        setSessions(data)
        setSource('backend')
      })
      .catch(err => {
        if (!isCurrentRequest()) return
        console.warn('[useSessionHistory] Backend fetch failed, falling back:', err.message)
        setSessions(getSessionHistory())
        setSource('fallback')
        setError(err.message)
      })
      .finally(() => {
        if (isCurrentRequest()) setLoading(false)
      })
  }, [authState.isAuthenticated, authState.isRestoring, authState.scopeKey])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    return () => {
      requestRef.current = { ...requestRef.current, id: requestRef.current.id + 1 }
    }
  }, [refresh])

  return { sessions, loading, error, source, refresh }
}
