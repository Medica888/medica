import { useState, useEffect, useCallback } from 'react'
import { governance } from '../lib/apiClient'

export function useReviewQueue({ status, sort = 'priority', page = 1, limit = 50 } = {}) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetch = useCallback(() => {
    setLoading(true)
    setError(null)
    governance.list({ status, sort, page, limit })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [status, sort, page, limit])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

export function useReviewDetail(id) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!id) { setLoading(false); return }
    setLoading(true)
    setError(null)
    governance.get(id)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [id])

  return { data, loading, error }
}

export function useReviewHistory(id) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const fetch = useCallback(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    governance.history(id)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

export function useReviewActions() {
  const [pending, setPending] = useState(false)
  const [error,   setError]   = useState(null)

  const act = useCallback(async (id, status) => {
    setPending(true)
    setError(null)
    try {
      return await governance.updateStatus(id, status)
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setPending(false)
    }
  }, [])

  return { pending, error, act }
}
