import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useMasteryOverview, useMasteryWeakest, useMasteryStrongest, useReadiness, useTopicReadiness, useMasterySubjects, useMasterySubjectConcepts } from './useMastery'

// Mock the entire apiClient module
vi.mock('../lib/apiClient', () => ({
  getAuthToken: vi.fn(),
  mastery: {
    overview:                  vi.fn(),
    weakest:                   vi.fn(),
    strongest:                 vi.fn(),
    concept:                   vi.fn(),
    adaptivePreview:           vi.fn(),
    adaptiveFlashcardsPreview: vi.fn(),
    readiness:                 vi.fn(),
    topicReadiness:            vi.fn(),
    subjects:                  vi.fn(),
    subjectConcepts:           vi.fn(),
  },
}))

import * as apiClient from '../lib/apiClient'

const OVERVIEW_DATA = {
  total_concepts:    5,
  avg_mastery_score: 0.6,
  avg_confidence:    0.4,
  distribution:      { priority: 2, focus: 1, reinforced: 1, ontrack: 1 },
  confident_concepts: 0,
}

const WEAKEST_DATA = {
  concepts: [
    { concept: { id: 'c1', name: 'AKI' }, mastery: { mastery_score: 0.1, attempts: 3 }, tier: 'priority' },
  ],
  count: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useMasteryOverview', () => {
  it('returns loading=true initially', () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.overview.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useMasteryOverview())
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns data when fetch succeeds', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.overview.mockResolvedValue(OVERVIEW_DATA)
    const { result } = renderHook(() => useMasteryOverview())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(OVERVIEW_DATA)
    expect(result.current.error).toBeNull()
  })

  it('skips fetch and returns loading=false when no token', async () => {
    apiClient.getAuthToken.mockReturnValue(null)
    const { result } = renderHook(() => useMasteryOverview())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(apiClient.mastery.overview).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
  })

  it('sets error when fetch rejects (non-401)', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    const err = new Error('Server error')
    apiClient.mastery.overview.mockRejectedValue(err)
    const { result } = renderHook(() => useMasteryOverview())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(err)
    expect(result.current.data).toBeNull()
  })

  it('sets error on 401 — caller decides whether to show it', async () => {
    apiClient.getAuthToken.mockReturnValue('expired-token')
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    apiClient.mastery.overview.mockRejectedValue(err)
    const { result } = renderHook(() => useMasteryOverview())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.status).toBe(401)
  })
})

describe('useMasteryWeakest', () => {
  it('returns weakest concepts data', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.weakest.mockResolvedValue(WEAKEST_DATA)
    const { result } = renderHook(() => useMasteryWeakest(5, 1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(WEAKEST_DATA)
  })

  it('passes limit and minAttempts to the API call', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.weakest.mockResolvedValue({ concepts: [], count: 0 })
    renderHook(() => useMasteryWeakest(8, 2))
    await waitFor(() => expect(apiClient.mastery.weakest).toHaveBeenCalledWith(8, 2))
  })
})

describe('useMasteryStrongest', () => {
  it('returns empty data without error when fetch returns empty list', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.strongest.mockResolvedValue({ concepts: [], count: 0 })
    const { result } = renderHook(() => useMasteryStrongest(5, 1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.concepts).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('skips fetch when no auth token', async () => {
    apiClient.getAuthToken.mockReturnValue(null)
    renderHook(() => useMasteryStrongest(5, 1))
    expect(apiClient.mastery.strongest).not.toHaveBeenCalled()
  })
})

const READINESS_DATA = {
  overallReadiness: 72,
  status: 'Approaching Readiness',
  components: { mastery: 35, confidence: 14, trend: 9, consistency: 12 },
  distribution: { priority: 2, focus: 3, reinforced: 4, ontrack: 6 },
  strongestAreas: [],
  weakestAreas: [],
  recommendedQuestions: 20,
  recommendedFlashcards: 15,
  estimatedStudyHours: 1.5,
}

const TOPIC_RD_DATA = {
  conceptId: 'c1',
  readiness: 65,
  status: 'Developing',
  trend: 'up',
  recommendation: 'Developing — continue practice with varied question angles.',
}

describe('useReadiness', () => {
  it('returns loading=true initially', () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.readiness.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useReadiness())
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns data on success', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.readiness.mockResolvedValue(READINESS_DATA)
    const { result } = renderHook(() => useReadiness())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(READINESS_DATA)
    expect(result.current.error).toBeNull()
  })

  it('skips fetch and returns loading=false when no token', async () => {
    apiClient.getAuthToken.mockReturnValue(null)
    const { result } = renderHook(() => useReadiness())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(apiClient.mastery.readiness).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
  })

  it('sets error on API failure', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    const err = new Error('Server error')
    apiClient.mastery.readiness.mockRejectedValue(err)
    const { result } = renderHook(() => useReadiness())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(err)
    expect(result.current.data).toBeNull()
  })

  it('sets error.status=401 on auth failure — caller handles display', async () => {
    apiClient.getAuthToken.mockReturnValue('expired')
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    apiClient.mastery.readiness.mockRejectedValue(err)
    const { result } = renderHook(() => useReadiness())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.status).toBe(401)
  })
})

describe('useTopicReadiness', () => {
  it('returns topic readiness data for a given conceptId', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.topicReadiness.mockResolvedValue(TOPIC_RD_DATA)
    const { result } = renderHook(() => useTopicReadiness('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(TOPIC_RD_DATA)
    expect(apiClient.mastery.topicReadiness).toHaveBeenCalledWith('c1')
  })

  it('resolves to null without calling API when no conceptId', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    const { result } = renderHook(() => useTopicReadiness(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(apiClient.mastery.topicReadiness).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
  })

  it('skips fetch when no auth token', async () => {
    apiClient.getAuthToken.mockReturnValue(null)
    renderHook(() => useTopicReadiness('c1'))
    expect(apiClient.mastery.topicReadiness).not.toHaveBeenCalled()
  })
})

const SUBJECTS_DATA = {
  subjects: [
    { subject: 'Pharmacology', rollupMastery: 0.45, rollupConfidence: 0.6, totalAttempts: 40, weakConceptCount: 3, tier: 'priority' },
    { subject: 'Cardiology',   rollupMastery: 0.88, rollupConfidence: 0.9, totalAttempts: 60, weakConceptCount: 0, tier: 'ontrack'  },
  ],
  count: 2,
}

describe('useMasterySubjects', () => {
  it('returns loading=true initially', () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.subjects.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useMasterySubjects())
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns subjects data on success', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.subjects.mockResolvedValue(SUBJECTS_DATA)
    const { result } = renderHook(() => useMasterySubjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(SUBJECTS_DATA)
    expect(result.current.error).toBeNull()
  })

  it('skips fetch and returns loading=false when no token', async () => {
    apiClient.getAuthToken.mockReturnValue(null)
    const { result } = renderHook(() => useMasterySubjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(apiClient.mastery.subjects).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
  })

  it('sets error on API failure', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    const err = new Error('Server error')
    apiClient.mastery.subjects.mockRejectedValue(err)
    const { result } = renderHook(() => useMasterySubjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(err)
    expect(result.current.data).toBeNull()
  })

  it('sets error.status=401 on auth failure', async () => {
    apiClient.getAuthToken.mockReturnValue('expired')
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    apiClient.mastery.subjects.mockRejectedValue(err)
    const { result } = renderHook(() => useMasterySubjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.status).toBe(401)
  })
})

const SUBJECT_CONCEPTS_DATA = {
  subject: 'Pharmacology',
  concepts: [
    { concept: { id: 'c1', name: 'Beta Blockers', subject: 'Pharmacology', system: 'Cardiovascular' }, mastery: { mastery_score: 0.3, attempts: 4, confidence_score: 0.5, correct: 1, recent_incorrect_count: 2 }, tier: 'priority' },
    { concept: { id: 'c2', name: 'ACE Inhibitors', subject: 'Pharmacology', system: 'Cardiovascular' }, mastery: { mastery_score: 0.7, attempts: 6, confidence_score: 0.7, correct: 4, recent_incorrect_count: 0 }, tier: 'focus' },
  ],
  count: 2,
}

describe('useMasterySubjectConcepts', () => {
  it('returns loading=true initially when subject is provided', () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.subjectConcepts.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useMasterySubjectConcepts('Pharmacology'))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns data on success', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.subjectConcepts.mockResolvedValue(SUBJECT_CONCEPTS_DATA)
    const { result } = renderHook(() => useMasterySubjectConcepts('Pharmacology'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(SUBJECT_CONCEPTS_DATA)
    expect(result.current.error).toBeNull()
    expect(apiClient.mastery.subjectConcepts).toHaveBeenCalledWith('Pharmacology')
  })

  it('resolves to null without calling API when subject is null', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    const { result } = renderHook(() => useMasterySubjectConcepts(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(apiClient.mastery.subjectConcepts).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
  })

  it('skips fetch when no auth token', async () => {
    apiClient.getAuthToken.mockReturnValue(null)
    renderHook(() => useMasterySubjectConcepts('Pharmacology'))
    expect(apiClient.mastery.subjectConcepts).not.toHaveBeenCalled()
  })

  it('refetches when subject changes', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.subjectConcepts.mockResolvedValue(SUBJECT_CONCEPTS_DATA)
    const { rerender } = renderHook(({ s }) => useMasterySubjectConcepts(s), { initialProps: { s: 'Pharmacology' } })
    await waitFor(() => expect(apiClient.mastery.subjectConcepts).toHaveBeenCalledWith('Pharmacology'))
    rerender({ s: 'Cardiology' })
    await waitFor(() => expect(apiClient.mastery.subjectConcepts).toHaveBeenCalledWith('Cardiology'))
  })

  it('sets error on API failure', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    const err = new Error('Server error')
    apiClient.mastery.subjectConcepts.mockRejectedValue(err)
    const { result } = renderHook(() => useMasterySubjectConcepts('Pharmacology'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(err)
  })
})