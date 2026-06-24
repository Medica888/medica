import { useState, useEffect } from 'react'
import { mastery as masteryApi } from '../lib/apiClient'
import { useAuthState } from './useAuthState.js'

function useApiCall(fetcher, deps = []) {
  const [result, setResult] = useState({ requestKey: '', data: null, error: null })
  const authState = useAuthState()
  const requestKey = [authState.scopeKey, ...deps].map(value => String(value ?? '')).join('|')

  useEffect(() => {
    if (!authState.isAuthenticated) return
    let cancelled = false
    fetcher()
      .then(data => {
        if (!cancelled) setResult({ requestKey, data, error: null })
      })
      .catch(error => {
        if (!cancelled) setResult({ requestKey, data: null, error })
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.isAuthenticated, requestKey])

  if (authState.isRestoring) return { data: null, loading: true, error: null }
  if (!authState.isAuthenticated) return { data: null, loading: false, error: null }
  if (result.requestKey !== requestKey) return { data: null, loading: true, error: null }
  return { data: result.data, loading: false, error: result.error }
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

export function useDailyStudyPlan() {
  return useApiCall(() => masteryApi.dailyPlan())
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

export function useReadiness() {
  return useApiCall(() => masteryApi.readiness())
}

export function useTopicReadiness(conceptId) {
  return useApiCall(
    () => (conceptId ? masteryApi.topicReadiness(conceptId) : Promise.resolve(null)),
    [conceptId],
  )
}

export function useMasterySubjects() {
  return useApiCall(() => masteryApi.subjects())
}

export function useMasterySubjectConcepts(subject) {
  return useApiCall(
    () => (subject ? masteryApi.subjectConcepts(subject) : Promise.resolve(null)),
    [subject],
  )
}

export function useDueReviews() {
  return useApiCall(() => masteryApi.dueReviews())
}

export function useReviewStats() {
  return useApiCall(() => masteryApi.reviewStats())
}

export function useConceptReviews(conceptId) {
  return useApiCall(
    () => (conceptId ? masteryApi.conceptReviews(conceptId) : Promise.resolve(null)),
    [conceptId],
  )
}
