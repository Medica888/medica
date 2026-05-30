import { useState, useEffect } from 'react'
import { mastery as masteryApi, getAuthToken } from '../lib/apiClient'

function useApiCall(fetcher, deps = []) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!getAuthToken()) { setLoading(false); return }
    let cancelled = false
    setLoading(true); setError(null)
    fetcher()
      .then(d  => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}

export function useMasteryOverview() {
  return useApiCall(() => masteryApi.overview())
}

export function useMasteryWeakest(limit = 5, minAttempts = 1) {
  return useApiCall(() => masteryApi.weakest(limit, minAttempts), [limit, minAttempts])
}

export function useMasteryStrongest(limit = 5, minAttempts = 1) {
  return useApiCall(() => masteryApi.strongest(limit, minAttempts), [limit, minAttempts])
}

export function useMasteryAdaptivePreview() {
  return useApiCall(() => masteryApi.adaptivePreview())
}

export function useAdaptiveFlashcardsPreview() {
  return useApiCall(() => masteryApi.adaptiveFlashcardsPreview())
}

export function useStudyPrescription() {
  return useApiCall(() => masteryApi.prescription())
}

export function useMasteryProgress() {
  return useApiCall(() => masteryApi.progress())
}

export function useMasteryTimeline() {
  return useApiCall(() => masteryApi.timeline())
}

export function useMasteryConcept(conceptId) {
  return useApiCall(
    () => (conceptId ? masteryApi.concept(conceptId) : Promise.resolve(null)),
    [conceptId],
  )
}
