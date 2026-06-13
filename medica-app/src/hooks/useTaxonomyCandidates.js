import { useState, useEffect, useCallback } from 'react'
import { taxonomyCandidates as tcApi } from '../lib/apiClient'

export function useTaxonomyCandidates({ status, page = 1, limit = 100 } = {}) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetch = useCallback(() => {
    setLoading(true)
    setError(null)
    tcApi.list({ status, page, limit })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [status, page, limit])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

export function useTaxonomyCandidateActions() {
  const [pending, setPending] = useState(false)
  const [error,   setError]   = useState(null)

  const act = useCallback(async (id, status, opts = {}) => {
    setPending(true)
    setError(null)
    try {
      return await tcApi.updateStatus(id, status, opts)
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setPending(false)
    }
  }, [])

  return { pending, error, act }
}
