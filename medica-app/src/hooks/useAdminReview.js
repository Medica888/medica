import { useState, useEffect, useCallback } from 'react'
import { governance } from '../lib/apiClient'

export function useReviewQueue({
  status,
  reviewStatus,
  commercialReady,
  sort = 'priority',
  page = 1,
  limit = 50,
} = {}) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetch = useCallback(() => {
    setLoading(true)
    setError(null)
    governance.list({ status, reviewStatus, commercialReady, sort, page, limit })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [status, reviewStatus, commercialReady, sort, page, limit])

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

export function useBulkReviewActions() {
  const [pending, setPending] = useState(false)
  const [error,   setError]   = useState(null)

  const actBulk = useCallback(async (ids, status) => {
    const uniqueIds = [...new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean))]
    if (uniqueIds.length === 0) return { succeeded: [], failed: [] }

    setPending(true)
    setError(null)
    try {
      const results = await Promise.allSettled(
        uniqueIds.map(id => governance.updateStatus(id, status)),
      )
      const succeeded = []
      const failed = []
      results.forEach((result, index) => {
        const id = uniqueIds[index]
        if (result.status === 'fulfilled') succeeded.push(id)
        else failed.push({ id, error: result.reason })
      })
      if (failed.length > 0) {
        const bulkError = new Error(`${failed.length} review action${failed.length === 1 ? '' : 's'} failed.`)
        bulkError.failed = failed
        setError(bulkError)
      }
      return { succeeded, failed }
    } finally {
      setPending(false)
    }
  }, [])

  return { pending, error, actBulk }
}

export function useReviewMetadataActions() {
  const [pending, setPending] = useState(false)
  const [error,   setError]   = useState(null)

  const update = useCallback(async (id, metadata) => {
    setPending(true)
    setError(null)
    try {
      return await governance.updateReviewMetadata(id, metadata)
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setPending(false)
    }
  }, [])

  return { pending, error, update }
}
