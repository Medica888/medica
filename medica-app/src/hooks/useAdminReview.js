import { useState, useEffect, useCallback } from 'react'
import { governance } from '../lib/apiClient'

export function useReviewQueue({
  status,
  reviewStatus,
  commercialReady,
  difficulty,
  subject,
  system,
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
    governance.list({ status, reviewStatus, commercialReady, difficulty, subject, system, sort, page, limit })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [status, reviewStatus, commercialReady, difficulty, subject, system, sort, page, limit])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

/** Distinct subject/system labels present in reviewable content, for the queue's filter selectors. */
export function useReviewFacets() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let cancelled = false
    governance.facets()
      .then(result => { if (!cancelled) setData(result) })
      .catch(err => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { data, loading, error }
}

/**
 * Downloads the filtered review queue as a CSV file. The browser save happens here, not in the
 * component, so the presentational queue only wires a button to `exportCsv`.
 */
export function useReviewExport() {
  const [pending, setPending] = useState(false)
  const [error,   setError]   = useState(null)

  const exportCsv = useCallback(async (filters) => {
    setPending(true)
    setError(null)
    try {
      const blob = await governance.exportCsv(filters)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'review-queue.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }, [])

  return { pending, error, exportCsv }
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

/** Runs `task(id)` for each unique id and reports which succeeded or failed. */
async function settleBulk(ids, task) {
  const uniqueIds = [...new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean))]
  const results = await Promise.allSettled(uniqueIds.map(task))
  const succeeded = []
  const failed = []
  results.forEach((result, index) => {
    const id = uniqueIds[index]
    if (result.status === 'fulfilled') succeeded.push(id)
    else failed.push({ id, error: result.reason })
  })
  return { succeeded, failed }
}

function useBulkRunner(task) {
  const [pending, setPending] = useState(false)
  const [error,   setError]   = useState(null)

  const run = useCallback(async (ids, arg) => {
    setPending(true)
    setError(null)
    try {
      const result = await settleBulk(ids, id => task(id, arg))
      if (result.failed.length > 0) {
        const bulkError = new Error(`${result.failed.length} review action${result.failed.length === 1 ? '' : 's'} failed.`)
        bulkError.failed = result.failed
        setError(bulkError)
      }
      return result
    } finally {
      setPending(false)
    }
  }, [task])

  return { pending, error, run }
}

export function useBulkReviewActions() {
  const { pending, error, run } = useBulkRunner(governance.updateStatus)
  return { pending, error, actBulk: run }
}

/** Applies the same review metadata (status, sources, accuracy) to many questions. */
export function useBulkReviewMetadata() {
  const { pending, error, run } = useBulkRunner(governance.updateReviewMetadata)
  return { pending, error, applyBulk: run }
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
