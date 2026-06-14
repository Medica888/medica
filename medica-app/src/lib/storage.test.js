import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  appendFlashcards,
  getFlashcardReviewEvents,
  filterReportedQuestions,
  appendTrustedGeneratedQuestions,
  getQuestionReportAnalytics,
  getQuestionReports,
  getTrustedGeneratedQuestionsForConfig,
  markFlashcardReviewed,
  saveQuestionReport,
  unreportQuestion,
} from './storage.js'

const question = (id, overrides = {}) => ({
  id,
  stem: `A patient has report test stem ${id}.`,
  testedConcept: 'ACE inhibitor cough',
  subject: 'Pharmacology',
  system: 'Cardiovascular',
  ...overrides,
})

describe('question report analytics', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns an empty analytics shape when no reports exist', () => {
    const analytics = getQuestionReportAnalytics()

    expect(analytics.total).toBe(0)
    expect(analytics.reasons).toEqual([])
    expect(analytics.topConcepts).toEqual([])
  })

  it('aggregates reports by reason, concept, and subject', () => {
    saveQuestionReport(question('q1'), 'wrong_answer', { mode: 'practice' })
    saveQuestionReport(question('q2'), 'wrong_answer', { mode: 'coach' })
    saveQuestionReport(question('q3', {
      testedConcept: 'Beta blocker toxicity',
      usmleContentArea: 'Cardiovascular System',
      physicianTask: 'Patient Care: Pharmacotherapy',
    }), 'off_topic', { mode: 'exam' })

    const analytics = getQuestionReportAnalytics()

    expect(analytics.total).toBe(3)
    expect(analytics.reasons[0]).toMatchObject({ reason: 'wrong_answer', label: 'Wrong answer', count: 2 })
    expect(analytics.topConcepts[0]).toMatchObject({ name: 'ACE inhibitor cough', count: 2 })
    expect(analytics.topSubjects[0]).toMatchObject({ name: 'Pharmacology', count: 3 })
    expect(analytics.topUsmleContentAreas[0]).toMatchObject({ name: 'Cardiovascular System', count: 3 })
    expect(analytics.topPhysicianTasks.find(t => t.name === 'Patient Care: Pharmacotherapy'))
      .toMatchObject({ name: 'Patient Care: Pharmacotherapy', count: 1 })
  })

  it('filters reported questions from future question pools', () => {
    const reported = question('q1')
    const clean = question('q2')
    saveQuestionReport(reported, 'wrong_answer', { mode: 'practice' })

    const filtered = filterReportedQuestions([reported, clean])

    expect(filtered).toEqual([clean])
  })

  it('filters reported questions by fingerprint when the id changes', () => {
    const reported = question('q1')
    const rewritten = question('q-new', {
      stem: reported.stem,
      testedConcept: reported.testedConcept,
    })
    const clean = question('q2')
    saveQuestionReport(reported, 'bad_explanation', { mode: 'coach' })

    const filtered = filterReportedQuestions([rewritten, clean])

    expect(filtered).toEqual([clean])
  })

  it('does not block all questions when a reported question has an empty fingerprint', () => {
    // A question with no stem and no testedConcept produces fingerprint '||'.
    // Reporting it should NOT exclude every other question with an empty fingerprint.
    const emptyQ = { id: 'empty-q', stem: '', testedConcept: '' }
    const normalQ = question('normal-q')
    saveQuestionReport(emptyQ, 'off_topic', { mode: 'practice' })

    const filtered = filterReportedQuestions([emptyQ, normalQ])

    // emptyQ is excluded by id match; normalQ survives because its fingerprint is not '||'
    expect(filtered).not.toContainEqual(expect.objectContaining({ id: 'empty-q' }))
    expect(filtered).toContainEqual(expect.objectContaining({ id: 'normal-q' }))
  })

  it('fingerprint matching uses the same logic as questionDedup.getQuestionFingerprint', () => {
    // The report stores the fingerprint computed by getQuestionFingerprint.
    // When filtering, the same function is used — so a question that matches
    // by fingerprint is excluded even if its id is different.
    const original = question('orig', { stem: 'A 45-year-old woman presents with fatigue and cold intolerance.', testedConcept: 'Hypothyroidism' })
    const sameContent = question('clone', { stem: original.stem, testedConcept: original.testedConcept })
    const different = question('other', { stem: 'Different stem entirely.', testedConcept: 'Hypertension' })
    saveQuestionReport(original, 'wrong_answer', { mode: 'practice' })

    const filtered = filterReportedQuestions([sameContent, different])

    expect(filtered).not.toContainEqual(expect.objectContaining({ id: 'clone' }))
    expect(filtered).toContainEqual(expect.objectContaining({ id: 'other' }))
  })
})

describe('unreportQuestion', () => {
  beforeEach(() => { localStorage.clear() })

  it('removes all reports for a question when no reason is specified', () => {
    const q = question('q1')
    saveQuestionReport(q, 'wrong_answer', { mode: 'practice' })
    saveQuestionReport(q, 'off_topic', { mode: 'practice' })

    const removed = unreportQuestion('q1')

    expect(removed).toBe(2)
    expect(getQuestionReports()).toHaveLength(0)
    expect(filterReportedQuestions([q])).toContainEqual(expect.objectContaining({ id: 'q1' }))
  })

  it('removes only the specific reason when reason is provided', () => {
    const q = question('q1')
    saveQuestionReport(q, 'wrong_answer', { mode: 'practice' })
    saveQuestionReport(q, 'off_topic', { mode: 'practice' })

    const removed = unreportQuestion('q1', 'wrong_answer')

    expect(removed).toBe(1)
    expect(getQuestionReports()).toHaveLength(1)
    expect(getQuestionReports()[0].reason).toBe('off_topic')
    // Still excluded because off_topic report remains
    expect(filterReportedQuestions([q])).toHaveLength(0)
  })

  it('removes report for one question without affecting reports for others', () => {
    const q1 = question('q1')
    const q2 = question('q2')
    saveQuestionReport(q1, 'wrong_answer', { mode: 'practice' })
    saveQuestionReport(q2, 'bad_explanation', { mode: 'practice' })

    unreportQuestion('q1')

    const reports = getQuestionReports()
    expect(reports).toHaveLength(1)
    expect(reports[0].questionId).toBe('q2')
    // q1 is back in pool; q2 is still excluded
    const filtered = filterReportedQuestions([q1, q2])
    expect(filtered).toContainEqual(expect.objectContaining({ id: 'q1' }))
    expect(filtered).not.toContainEqual(expect.objectContaining({ id: 'q2' }))
  })

  it('returns 0 and does nothing when question was never reported', () => {
    const removed = unreportQuestion('never-reported')
    expect(removed).toBe(0)
    expect(getQuestionReports()).toHaveLength(0)
  })

  it('dispatches QUESTION_REPORTS_UPDATED_EVENT when a report is removed', () => {
    const q = question('q1')
    saveQuestionReport(q, 'wrong_answer', { mode: 'practice' })

    let eventFired = false
    window.addEventListener('medica:question-reports-updated', () => { eventFired = true }, { once: true })
    unreportQuestion('q1')

    expect(eventFired).toBe(true)
  })
})

describe('trusted generated question matching', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns trusted questions matching the requested mode and scope', () => {
    appendTrustedGeneratedQuestions([
      question('q1', { subject: 'Pharmacology', system: 'Cardiovascular', usmleContentArea: 'Cardiovascular System', physicianTask: 'Patient Care: Pharmacotherapy' }),
      question('q2', { subject: 'Pathology', system: 'Respiratory' }),
    ], { mode: 'practice', difficulty: 'Balanced' })

    const matches = getTrustedGeneratedQuestionsForConfig({
      mode: 'practice',
      subject: 'Pharmacology',
      system: 'All Systems',
      difficulty: 'Balanced',
    })

    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe('q1')
    expect(matches[0].usmleContentArea).toBe('Cardiovascular System')
    expect(matches[0].physicianTask).toBe('Patient Care: Pharmacotherapy')
  })

  it('does not return trusted questions from a different mode', () => {
    appendTrustedGeneratedQuestions([
      question('q1', { subject: 'Pharmacology' }),
    ], { mode: 'coach' })

    const matches = getTrustedGeneratedQuestionsForConfig({
      mode: 'practice',
      subject: 'All Subjects',
      system: 'All Systems',
    })

    expect(matches).toEqual([])
  })
})

describe('flashcard storage quality gate', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not save copied question-stem flashcards', async () => {
    const added = appendFlashcards([
      {
        id: 'bad-card',
        sourceQuestionId: 'q1',
        tag: 'Recall',
        front: 'Which management approach is most appropriate?',
        back: 'A specific clinical mechanism causes the finding through a defined pathway.',
      },
    ])

    expect(added).toBe(0)
    expect(JSON.parse(localStorage.getItem('medica:flashcards') || '[]')).toEqual([])
  })

  it('saves concept-based clinical reinforcement cards', async () => {
    const added = appendFlashcards([
      {
        id: 'good-card',
        sourceQuestionId: 'q1',
        tag: 'Recall',
        front: 'In RV infarction, what clinical mechanism explains preload-dependent management?',
        back: 'Right ventricular output depends on adequate preload because infarction limits RV contractility.',
      },
    ])

    const saved = JSON.parse(localStorage.getItem('medica:flashcards') || '[]')
    expect(added).toBe(1)
    expect(saved[0].id).toBe('good-card')
  })

  it('records flashcard review events with learning metadata', () => {
    appendFlashcards([
      {
        id: 'review-card',
        sourceQuestionId: 'q1',
        tag: 'Recall',
        front: 'In loop diuretics, what mechanism causes potassium wasting?',
        back: 'Loop diuretics increase distal sodium delivery because NKCC inhibition increases tubular flow.',
        testedConcept: 'Loop diuretics',
        subject: 'Pharmacology',
        system: 'Renal / Urinary',
        topicGroup: 'Diuretics',
        sourceMode: 'practice',
      },
    ])

    markFlashcardReviewed('review-card', 'again')

    const events = getFlashcardReviewEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      cardId: 'review-card',
      ease: 'again',
      status: 'learning',
      concept: 'Loop diuretics',
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      topic: 'Diuretics',
    })
  })
})

// ── saveQuestionReport — ambiguous_or_insufficient_clues reason ──────────────

describe('saveQuestionReport — ambiguous_or_insufficient_clues reason', () => {
  beforeEach(() => { localStorage.clear() })

  it('saves with the new reason to localStorage', () => {
    const q = question('q-ambig')
    saveQuestionReport(q, 'ambiguous_or_insufficient_clues', { mode: 'practice' })
    const reports = getQuestionReports()
    expect(reports).toHaveLength(1)
    expect(reports[0].reason).toBe('ambiguous_or_insufficient_clues')
    expect(reports[0].questionId).toBe('q-ambig')
  })

  it('filterReportedQuestions hides a question reported as ambiguous', () => {
    const q = question('q-hide-ambig')
    const other = question('q-other')
    saveQuestionReport(q, 'ambiguous_or_insufficient_clues', { mode: 'practice' })
    const filtered = filterReportedQuestions([q, other])
    expect(filtered.find(x => x.id === 'q-hide-ambig')).toBeUndefined()
    expect(filtered.find(x => x.id === 'q-other')).toBeDefined()
  })

  it('existing reasons still work alongside new reason', () => {
    const q1 = question('q-wa')
    const q2 = question('q-be')
    const q3 = question('q-ot')
    const q4 = question('q-ambig2')
    saveQuestionReport(q1, 'wrong_answer', { mode: 'practice' })
    saveQuestionReport(q2, 'bad_explanation', { mode: 'practice' })
    saveQuestionReport(q3, 'off_topic', { mode: 'practice' })
    saveQuestionReport(q4, 'ambiguous_or_insufficient_clues', { mode: 'practice' })
    expect(getQuestionReports()).toHaveLength(4)
    expect(filterReportedQuestions([q1, q2, q3, q4])).toHaveLength(0)
  })
})

// ── saveQuestionReport — backend fire-and-forget POST ─────────────────────────

describe('saveQuestionReport — backend POST (fire-and-forget)', () => {
  const q = (id, overrides = {}) => ({
    id,
    stem: `A 45-year-old patient presents with ${id}.`,
    testedConcept: 'ACE inhibitor cough',
    subject: 'Pharmacology',
    system: 'Cardiovascular',
    ...overrides,
  })

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('still saves locally when the backend POST fails', () => {
    vi.stubEnv('VITE_USE_BACKEND_API', 'true')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    saveQuestionReport(q('q-net-fail'), 'wrong_answer', { mode: 'practice' })

    expect(getQuestionReports()).toHaveLength(1)
    expect(getQuestionReports()[0].questionId).toBe('q-net-fail')
  })

  it('attempts backend POST when VITE_USE_BACKEND_API is true', () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'srv-1' }) })
    vi.stubEnv('VITE_USE_BACKEND_API', 'true')
    vi.stubGlobal('fetch', mockFetch)

    saveQuestionReport(q('q-post'), 'wrong_answer', { mode: 'practice' })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/question-reports',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('does NOT attempt backend POST when VITE_USE_BACKEND_API is not true', () => {
    const mockFetch = vi.fn()
    vi.stubEnv('VITE_USE_BACKEND_API', 'false')
    vi.stubGlobal('fetch', mockFetch)

    saveQuestionReport(q('q-no-post'), 'wrong_answer', { mode: 'practice' })

    expect(mockFetch).not.toHaveBeenCalled()
    // Local save still happened
    expect(getQuestionReports()).toHaveLength(1)
  })

  it('backend POST payload includes fingerprint and reason', () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubEnv('VITE_USE_BACKEND_API', 'true')
    vi.stubGlobal('fetch', mockFetch)

    const question = q('q-payload', { stem: 'A 38-year-old woman presents with persistent dry cough after starting lisinopril.' })
    saveQuestionReport(question, 'bad_explanation', { mode: 'coach', source: 'ai' })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('http://localhost:4000/api/question-reports')
    const body = JSON.parse(opts.body)
    expect(body.fingerprint).toBeDefined()
    expect(body.fingerprint).not.toBe('')
    expect(body.reason).toBe('bad_explanation')
    expect(body.questionId).toBe('q-payload')
    expect(body.mode).toBe('coach')
    expect(body.source).toBe('ai')
  })

  it('local QUESTION_REPORTS_UPDATED_EVENT still fires regardless of backend status', () => {
    // Backend disabled — event should still fire from local save
    vi.stubEnv('VITE_USE_BACKEND_API', 'false')
    let fired = false
    window.addEventListener('medica:question-reports-updated', () => { fired = true }, { once: true })

    saveQuestionReport(q('q-event'), 'off_topic', { mode: 'practice' })

    expect(fired).toBe(true)
  })

  it('backend POST is sent with the ambiguous_or_insufficient_clues reason', () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubEnv('VITE_USE_BACKEND_API', 'true')
    vi.stubGlobal('fetch', mockFetch)

    saveQuestionReport(q('q-ambig-post'), 'ambiguous_or_insufficient_clues', { mode: 'practice' })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.reason).toBe('ambiguous_or_insufficient_clues')
  })

  it('backend POST body stemPreview is truncated to 100 chars', () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubEnv('VITE_USE_BACKEND_API', 'true')
    vi.stubGlobal('fetch', mockFetch)
    const longStem = 'A'.repeat(200)

    saveQuestionReport(q('q-trunc', { stem: longStem }), 'wrong_answer', {})

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.stemPreview.length).toBeLessThanOrEqual(100)
  })
})
