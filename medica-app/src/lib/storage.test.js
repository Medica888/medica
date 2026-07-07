import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  appendFlashcards,
  getFlashcardReviewEvents,
  filterReportedQuestions,
  appendTrustedGeneratedQuestions,
  getQuestionReportAnalytics,
  getQuestionReports,
  getFlashcards,
  getQBankProgressLedger,
  getSessionHistory,
  getTrustedGeneratedQuestionsForConfig,
  hasPendingAnonymousDataMigration,
  importAnonymousStudyData,
  keepAnonymousStudyDataSeparate,
  markFlashcardReviewed,
  markLastQuizSessionCompleted,
  saveCompletedSession,
  saveFlashcards,
  saveQuizSession,
  getLastQuizSession,
  saveQuestionReport,
  unreportQuestion,
} from './storage.js'
import { getSessionSyncOutbox } from './sessionSyncOutbox.js'
import * as apiClient from './apiClient.js'
import { setAuthSession } from './apiClient.js'

const question = (id, overrides = {}) => ({
  id,
  stem: `A patient has report test stem ${id}.`,
  testedConcept: 'ACE inhibitor cough',
  subject: 'Pharmacology',
  system: 'Cardiovascular',
  ...overrides,
})

describe('user-scoped study storage', () => {
  beforeEach(() => {
    localStorage.clear()
    setAuthSession('anonymous')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setAuthSession('anonymous')
  })

  it('marks only the matching saved quiz session as completed', () => {
    saveQuizSession({ id: 'active-session', clientSessionId: 'client-active', completed: false })

    expect(markLastQuizSessionCompleted('different-session', '2026-07-02T10:00:00.000Z')).toBe(false)
    expect(getLastQuizSession().completed).toBe(false)

    expect(markLastQuizSessionCompleted('client-active', '2026-07-02T10:00:00.000Z')).toBe(true)
    expect(getLastQuizSession()).toMatchObject({
      id: 'active-session',
      completed: true,
      completedAt: '2026-07-02T10:00:00.000Z',
    })
  })

  it('keeps compact QBank progress after detailed session history is capped', () => {
    for (let index = 0; index < 51; index += 1) {
      const completedAt = `2026-06-${String((index % 28) + 1).padStart(2, '0')}T10:${String(index).padStart(2, '0')}:00.000Z`
      saveCompletedSession({
        id: `session-${index}`,
        completedAt,
        questionAttempts: [{
          questionId: `q-${index}`,
          result: index === 0 ? 'incorrect' : 'correct',
          sessionId: `session-${index}`,
          completedAt,
        }],
      })
    }

    expect(getSessionHistory()).toHaveLength(50)
    expect(getSessionHistory().some(session => session.id === 'session-0')).toBe(false)
    expect(getQBankProgressLedger()).toContainEqual(expect.objectContaining({
      questionId: 'q-0',
      attemptCount: 1,
      latestResult: 'incorrect',
    }))
  })

  it('does not count an idempotent session save twice in QBank progress', () => {
    const record = {
      id: 'session-repeat',
      completedAt: '2026-06-20T10:00:00.000Z',
      questionAttempts: [{
        questionId: 'q-repeat',
        result: 'correct',
        sessionId: 'session-repeat',
        completedAt: '2026-06-20T10:00:00.000Z',
      }],
    }
    saveCompletedSession(record)
    saveCompletedSession(record)

    expect(getQBankProgressLedger()).toContainEqual(expect.objectContaining({
      questionId: 'q-repeat',
      attemptCount: 1,
      correctSessionCount: 1,
    }))
  })

  it('isolates sessions and flashcards between browser users', () => {
    setAuthSession('authenticated', 'user-a')
    saveCompletedSession({ id: 'session-a', completedAt: '2026-06-24T10:00:00.000Z' })
    saveFlashcards([{ id: 'card-a', front: 'A?', back: 'A' }])

    setAuthSession('authenticated', 'user-b')
    expect(getSessionHistory()).toEqual([])
    expect(getFlashcards()).toEqual([])

    saveCompletedSession({ id: 'session-b', completedAt: '2026-06-24T11:00:00.000Z' })
    setAuthSession('authenticated', 'user-a')
    expect(getSessionHistory().map(item => item.id)).toEqual(['session-a'])
    expect(getFlashcards().map(item => item.id)).toEqual(['card-a'])
  })

  it('imports anonymous study data only after explicit approval', () => {
    saveCompletedSession({ id: 'anonymous-session', completedAt: '2026-06-24T10:00:00.000Z' })
    saveFlashcards([{ id: 'anonymous-card', front: 'Q?', back: 'A' }])

    setAuthSession('authenticated', 'user-a')
    expect(hasPendingAnonymousDataMigration('user-a')).toBe(true)
    expect(getSessionHistory()).toEqual([])

    const result = importAnonymousStudyData('user-a')
    expect(result.error).toBeUndefined()
    expect(getSessionHistory().map(item => item.id)).toEqual(['anonymous-session'])
    expect(getFlashcards().map(item => item.id)).toEqual(['anonymous-card'])
    expect(hasPendingAnonymousDataMigration('user-a')).toBe(false)

    setAuthSession('anonymous')
    expect(getSessionHistory()).toEqual([])
    expect(getFlashcards()).toEqual([])
  })

  it('keeps anonymous data intact when the user declines import', () => {
    saveCompletedSession({ id: 'anonymous-session', completedAt: '2026-06-24T10:00:00.000Z' })

    setAuthSession('authenticated', 'user-a')
    expect(keepAnonymousStudyDataSeparate('user-a')).toBe(true)
    expect(hasPendingAnonymousDataMigration('user-a')).toBe(false)
    expect(getSessionHistory()).toEqual([])

    setAuthSession('anonymous')
    expect(getSessionHistory().map(item => item.id)).toEqual(['anonymous-session'])
  })

  it('rolls back account writes if an anonymous import cannot complete', () => {
    saveCompletedSession({ id: 'anonymous-session', completedAt: '2026-06-24T10:00:00.000Z' })
    saveFlashcards([{ id: 'anonymous-card', front: 'Q?', back: 'A' }])
    setAuthSession('authenticated', 'user-a')

    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (key === 'medica:flashcards:user:user-a') throw new Error('Quota exceeded')
      return originalSetItem.call(this, key, value)
    })

    const result = importAnonymousStudyData('user-a')
    expect(result.error).toBe('Import could not be completed')
    expect(localStorage.getItem('medica_session_history')).not.toBeNull()
    expect(localStorage.getItem('medica:flashcards')).not.toBeNull()
    expect(localStorage.getItem('medica_session_history:user:user-a')).toBeNull()
  })
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

// ── saveQuestionReport — outbox sync ─────────────────────────────────────────

describe('saveQuestionReport — outbox sync', () => {
  const TEST_USER = 'test-user-storage'

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
    vi.spyOn(apiClient, 'getCurrentUserId').mockReturnValue(TEST_USER)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('still saves locally regardless of outbox state', () => {
    saveQuestionReport(q('q-net-fail'), 'wrong_answer', { mode: 'practice' })

    expect(getQuestionReports()).toHaveLength(1)
    expect(getQuestionReports()[0].questionId).toBe('q-net-fail')
  })

  it('keeps the local report when the backend later rejects it as ineligible (403)', async () => {
    const eligibilityUser = `${TEST_USER}-eligibility`
    vi.mocked(apiClient.getCurrentUserId).mockReturnValue(eligibilityUser)
    // Mock at the apiClient boundary — saveQuestionReport triggers its own fire-and-forget
    // auto-drain (via enqueueQuestionReportSync().then(drainSessionSyncOutbox)) using the
    // real questionReports.create, so we wait for that to settle rather than racing it with
    // a separately-mocked manual drain.
    const ineligible = Object.assign(new Error('not eligible'), {
      status: 403,
      code: 'REPORTER_NOT_ELIGIBLE',
    })
    vi.spyOn(apiClient.questionReports, 'create').mockRejectedValue(ineligible)

    saveQuestionReport(q('q-ineligible'), 'wrong_answer', { mode: 'practice' })
    expect(getQuestionReports()).toHaveLength(1)

    // The eligibility rejection is local-only (not a synchronization failure) and is
    // cleared from the retry queue — but the local report itself is never lost.
    await vi.waitFor(() => {
      expect(getSessionSyncOutbox(eligibilityUser)).toHaveLength(0)
    })
    expect(getQuestionReports()).toHaveLength(1)
    expect(getQuestionReports()[0].questionId).toBe('q-ineligible')
  })

  it('enqueues a question-report outbox entry when user is authenticated', () => {
    saveQuestionReport(q('q-post'), 'wrong_answer', { mode: 'practice' })

    const outbox = getSessionSyncOutbox(TEST_USER)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].operationType).toBe('question-report')
  })

  it('does NOT enqueue when no user is authenticated', () => {
    vi.spyOn(apiClient, 'getCurrentUserId').mockReturnValue('')

    saveQuestionReport(q('q-no-post'), 'wrong_answer', { mode: 'practice' })

    const outbox = getSessionSyncOutbox('')
    expect(outbox).toHaveLength(0)
    // Local save still happened
    expect(getQuestionReports()).toHaveLength(1)
  })

  // ── Feature flag: VITE_USE_BACKEND (question reports are ordinary backend
  // sync, same flag as sessions/flashcards — never VITE_USE_BACKEND_API,
  // which is reserved for live AI generation) ─────────────────────────────

  it('VITE_USE_BACKEND=true enables report synchronization', () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')

    saveQuestionReport(q('q-flag-on'), 'wrong_answer', { mode: 'practice' })

    const outbox = getSessionSyncOutbox(TEST_USER)
    expect(outbox).toHaveLength(1)
  })

  it('VITE_USE_BACKEND=false keeps reports local — no outbox entry, no backend call', () => {
    vi.stubEnv('VITE_USE_BACKEND', 'false')
    const createSpy = vi.spyOn(apiClient.questionReports, 'create')

    saveQuestionReport(q('q-flag-off'), 'wrong_answer', { mode: 'practice' })

    const outbox = getSessionSyncOutbox(TEST_USER)
    expect(outbox).toHaveLength(0)
    expect(createSpy).not.toHaveBeenCalled()
    // Local save still happened — local persistence continues when backend sync is unavailable.
    expect(getQuestionReports()).toHaveLength(1)
  })

  it('keeps anonymous reports local and never sends them to shared governance', () => {
    vi.spyOn(apiClient, 'getCurrentUserId').mockReturnValue('')
    const createSpy = vi.spyOn(apiClient.questionReports, 'create').mockResolvedValue({ id: 'r1' })

    saveQuestionReport(q('q-anon'), 'wrong_answer', { mode: 'practice' })

    expect(createSpy).not.toHaveBeenCalled()
    expect(getSessionSyncOutbox('')).toHaveLength(0)
    expect(getQuestionReports()).toHaveLength(1)
  })

  it('outbox payload includes fingerprint, reason, questionId, mode, source', () => {
    const question = q('q-payload', { stem: 'A 38-year-old woman presents with persistent dry cough after starting lisinopril.' })
    saveQuestionReport(question, 'bad_explanation', { mode: 'coach', source: 'ai' })

    const outbox = getSessionSyncOutbox(TEST_USER)
    expect(outbox).toHaveLength(1)
    const { payload } = outbox[0]
    expect(payload.fingerprint).toBeDefined()
    expect(payload.fingerprint).not.toBe('')
    expect(payload.reason).toBe('bad_explanation')
    expect(payload.questionId).toBe('q-payload')
    expect(payload.mode).toBe('coach')
    expect(payload.source).toBe('ai')
  })

  it.each([
    ['validated-qbank', 'trusted_bank'],
    ['authored', 'trusted_bank'],
    ['validated-local-bank', 'trusted_bank'],
    ['mock-fallback', 'mock'],
    ['fallback-bank', 'mock'],
  ])('normalizes report source %s for the backend contract', (source, expected) => {
    saveQuestionReport(q(`q-source-${source}`), 'wrong_answer', { mode: 'exam', source })

    const outbox = getSessionSyncOutbox(TEST_USER)
    expect(outbox[0].payload.source).toBe(expected)
  })

  it('omits unknown report sources instead of sending an invalid enum value', () => {
    saveQuestionReport(q('q-source-unknown'), 'wrong_answer', {
      mode: 'practice',
      source: 'future-source',
    })

    const outbox = getSessionSyncOutbox(TEST_USER)
    expect(outbox[0].payload.source).toBeNull()
  })

  it('local QUESTION_REPORTS_UPDATED_EVENT fires from local save', () => {
    let fired = false
    window.addEventListener('medica:question-reports-updated', () => { fired = true }, { once: true })

    saveQuestionReport(q('q-event'), 'off_topic', { mode: 'practice' })

    expect(fired).toBe(true)
  })

  it('outbox payload contains the ambiguous_or_insufficient_clues reason', () => {
    saveQuestionReport(q('q-ambig-post'), 'ambiguous_or_insufficient_clues', { mode: 'practice' })

    const outbox = getSessionSyncOutbox(TEST_USER)
    expect(outbox[0].payload.reason).toBe('ambiguous_or_insufficient_clues')
  })

  it('outbox payload stemPreview is truncated to 100 chars', () => {
    const longStem = 'A'.repeat(200)
    saveQuestionReport(q('q-trunc', { stem: longStem }), 'wrong_answer', {})

    const outbox = getSessionSyncOutbox(TEST_USER)
    expect(outbox[0].payload.stemPreview.length).toBeLessThanOrEqual(100)
  })

  it('outbox payload includes clientReportId for backend dedup', () => {
    saveQuestionReport(q('q-idem'), 'wrong_answer', {})

    const outbox = getSessionSyncOutbox(TEST_USER)
    expect(outbox[0].payload.clientReportId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })
})
