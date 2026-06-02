import { describe, expect, it, beforeEach } from 'vitest'
import {
  appendFlashcards,
  filterReportedQuestions,
  appendTrustedGeneratedQuestions,
  getQuestionReportAnalytics,
  getTrustedGeneratedQuestionsForConfig,
  saveQuestionReport,
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
