import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import { useMasteryOverview, useMasteryWeakest, useMasteryStrongest, useReadiness, useTopicReadiness, useMasterySubjects, useMasterySubjectConcepts, useDailyStudyPlan } from './useMastery'
import StudyPrescriptionPanel from '../components/analytics/StudyPrescriptionPanel'

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
    prescription:              vi.fn(),
    dailyPlan:                 vi.fn(),
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

const DAILY_PLAN_DATA = {
  date: '2026-05-31',
  readinessStatus: 'Developing',
  estimatedMinutes: 45,
  recommendedQuestions: 12,
  recommendedFlashcards: 8,
  conceptReviews: [
    {
      conceptId: 'c1',
      name: 'ACE Inhibitors',
      subject: 'Pharmacology',
      priority: 'priority',
      reason: 'Low mastery and recent incorrect answers',
    },
  ],
  focusSubjects: ['Pharmacology'],
  summary: 'Focus today on weak pharmacology concepts.',
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

describe('useDailyStudyPlan', () => {
  it('returns daily plan data on success', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.dailyPlan.mockResolvedValue(DAILY_PLAN_DATA)
    const { result } = renderHook(() => useDailyStudyPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(DAILY_PLAN_DATA)
    expect(apiClient.mastery.dailyPlan).toHaveBeenCalledTimes(1)
  })

  it('skips fetch when no auth token', async () => {
    apiClient.getAuthToken.mockReturnValue(null)
    const { result } = renderHook(() => useDailyStudyPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(apiClient.mastery.dailyPlan).not.toHaveBeenCalled()
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

const PRESCRIPTION_DATA = {
  strategy: 'adaptive',
  enabled: true,
  priority: [
    {
      name: 'ACE Inhibitors',
      subject: 'Pharmacology',
      masteryScore: 0.3,
      confidence: 0.4,
      attempts: 4,
      recentIncorrect: 2,
      recommendation: 'Below passing threshold',
    },
  ],
  focus: [],
  reinforced: [],
  estimatedStudyTime: 5,
  recommendedQuestions: 5,
  recommendedFlashcards: 3,
}

describe('StudyPrescriptionPanel daily plan render', () => {
  it('shows the daily plan at the top of the existing prescription panel', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.prescription.mockResolvedValue(PRESCRIPTION_DATA)
    apiClient.mastery.dailyPlan.mockResolvedValue(DAILY_PLAN_DATA)

    render(createElement(StudyPrescriptionPanel))

    await waitFor(() => expect(screen.getByText('Today')).toBeTruthy())
    expect(screen.getByText('Focus today on weak pharmacology concepts.')).toBeTruthy()
    expect(screen.getAllByText('ACE Inhibitors').length).toBeGreaterThan(0)
    expect(screen.getByText('Low mastery and recent incorrect answers')).toBeTruthy()
  })

  it('renders the daily plan empty state alongside insufficient prescription data', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.prescription.mockResolvedValue({
      strategy: 'random',
      enabled: false,
      reason: 'Only 0 concept(s) tracked',
      priority: [],
      focus: [],
      reinforced: [],
      estimatedStudyTime: 0,
      recommendedQuestions: 10,
      recommendedFlashcards: 10,
    })
    apiClient.mastery.dailyPlan.mockResolvedValue({
      ...DAILY_PLAN_DATA,
      estimatedMinutes: 30,
      conceptReviews: [],
      focusSubjects: [],
      summary: 'No urgent concept reviews today. Maintain progress with light mixed practice.',
    })

    render(createElement(StudyPrescriptionPanel))

    await waitFor(() => expect(screen.getByText('No urgent concept reviews today. Maintain progress with light mixed practice.')).toBeTruthy())
    expect(screen.getByText('Only 0 concept(s) tracked')).toBeTruthy()
  })
})
