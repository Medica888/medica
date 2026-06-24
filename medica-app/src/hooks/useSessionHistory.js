import { useState, useEffect, useCallback, useRef } from 'react'
import { isAuthenticated } from '../lib/apiClient.js'
import { getSessionHistory } from '../lib/storage.js'
import { normalizeBackendSession, fetchAllBackendSessions } from '../lib/sessionNormalizer.js'

export { normalizeBackendSession }

// ── Hook ──────────────────────────────────────────────────────────────────

export function useSessionHistory() {
  // Evaluate at call time so vi.stubEnv works in tests and hot-reloading is safe.
  // Both flags must be true: VITE_USE_BACKEND gates the write path in dataProvider
  // — if backend writes are disabled the backend has no data, so reads must also stay local.
  const useBackend = import.meta.env.VITE_USE_BACKEND === 'true'
  const isReady    = useBackend && isAuthenticated()

  const [sessions, setSessions] = useState(getSessionHistory)
  const [loading, setLoading]   = useState(isReady)
  const [error, setError]       = useState(null)
  const [source, setSource]     = useState(isReady ? 'backend' : 'localStorage')

  // cancelRef is set to true on unmount so in-flight multi-page fetches drop their results.
  const cancelRef = useRef(false)

  const refresh = useCallback(() => {
    cancelRef.current = false
    const backendEnabled = import.meta.env.VITE_USE_BACKEND === 'true'
    if (!backendEnabled || !isAuthenticated()) {
      setSessions(getSessionHistory())
      setSource('localStorage')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    fetchAllBackendSessions()
      .then(data => {
        if (cancelRef.current) return
        setSessions(data)
        setSource('backend')
      })
      .catch(err => {
        if (cancelRef.current) return
        console.warn('[useSessionHistory] Backend fetch failed, falling back:', err.message)
        setSessions(getSessionHistory())
        setSource('fallback')
        setError(err.message)
      })
      .finally(() => {
        if (!cancelRef.current) setLoading(false)
      })
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    return () => { cancelRef.current = true }
  }, [refresh])

  return { sessions, loading, error, source, refresh }
}
