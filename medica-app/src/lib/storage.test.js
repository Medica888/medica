import { describe, expect, it, beforeEach } from 'vitest'
import {
  appendFlashcards,
  filterReportedQuestions,
  appendTrustedGeneratedQuestions,
  getQuestionReportAnalytics,
  getQuestionReports,
  getTrustedGeneratedQuestionsForConfig,
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
})
