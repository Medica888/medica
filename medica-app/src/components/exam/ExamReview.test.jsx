import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExamReview from './ExamReview'
import ExamResults from './ExamResults'

vi.mock('../../lib/storage', () => ({
  saveQuestionReport: vi.fn(),
}))

// scrollIntoView is not implemented in jsdom — mock it globally
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeQuestion(id, correct, overrides = {}) {
  return {
    id,
    stem: `Stem for question ${id}`,
    options: [
      { letter: 'A', text: 'Option A' },
      { letter: 'B', text: 'Option B' },
      { letter: 'C', text: 'Option C' },
      { letter: 'D', text: 'Option D' },
    ],
    correct,
    explanation: `Explanation for ${id}`,
    subject: 'Pathology',
    system: 'Cardiovascular',
    difficulty: 'Medium',
    ...overrides,
  }
}

function makeSession(overrides = {}) {
  const q1 = makeQuestion('q1', 'A')
  const q2 = makeQuestion('q2', 'B')
  const q3 = makeQuestion('q3', 'C')
  return {
    id: 'session1',
    mode: 'exam',
    config: { subject: 'Pathology', system: 'Cardiovascular', mode: 'exam', source: 'ai' },
    questions: [q1, q2, q3],
    answers: {
      q1: 'A',  // correct
      q2: 'A',  // wrong (correct is B)
      // q3 unanswered
    },
    marked: { q1: true },
    ...overrides,
  }
}

const NOOP = vi.fn()

// ── Test 1: Review All Answers routes to exam-review via ExamResults ──────────

describe('ExamResults — Review All Answers button', () => {
  it('calls onReview("all") when Review All Answers is clicked', () => {
    const onReview = vi.fn()
    const results = {
      total: 3, correct: 1, percentage: 33,
      subjectBreakdown: [], systemBreakdown: [], weakAreas: [],
      medicaScore: 200, readinessLabel: 'Building', recommendation: 'Keep studying.',
      completedAt: new Date().toISOString(),
    }
    render(
      <ExamResults
        results={results}
        session={makeSession()}
        onReview={onReview}
        onNewQuiz={NOOP}
        onBackToBuilder={NOOP}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /review all answers/i }))
    expect(onReview).toHaveBeenCalledWith('all')
  })

  it('calls onReview("incorrect") when Incorrect tile is clicked', () => {
    const onReview = vi.fn()
    const results = {
      total: 3, correct: 1, percentage: 33,
      subjectBreakdown: [], systemBreakdown: [], weakAreas: [],
      medicaScore: 200, readinessLabel: 'Building', recommendation: 'Keep studying.',
      completedAt: new Date().toISOString(),
    }
    render(
      <ExamResults
        results={results}
        session={makeSession()}
        onReview={onReview}
        onNewQuiz={NOOP}
        onBackToBuilder={NOOP}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /incorrect/i }))
    expect(onReview).toHaveBeenCalledWith('incorrect')
  })
})

// ── Test 3: Incorrect filter shows only incorrect cards ──────────────────────

describe('ExamReview — filter: incorrect', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows only incorrectly-answered questions', () => {
    render(
      <ExamReview
        session={makeSession()}
        initialFilter="incorrect"
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    // q2 was answered wrong; q1 was correct; q3 was unanswered
    expect(screen.getByText('Stem for question q2')).toBeInTheDocument()
    expect(screen.queryByText('Stem for question q1')).toBeNull()
    expect(screen.queryByText('Stem for question q3')).toBeNull()
  })

  it('shows a full card with stem and options for incorrect questions', () => {
    render(
      <ExamReview
        session={makeSession()}
        initialFilter="incorrect"
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    expect(screen.getByText('Stem for question q2')).toBeInTheDocument()
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText(/Explanation for q2/)).toBeInTheDocument()
  })
})

// ── Test 4: Unanswered questions show correct answer and full question ─────────

describe('ExamReview — filter: unanswered', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows only unanswered questions', () => {
    render(
      <ExamReview
        session={makeSession()}
        initialFilter="unanswered"
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    expect(screen.getByText('Stem for question q3')).toBeInTheDocument()
    expect(screen.queryByText('Stem for question q1')).toBeNull()
    expect(screen.queryByText('Stem for question q2')).toBeNull()
  })

  it('shows the correct answer for an unanswered question', () => {
    const { container } = render(
      <ExamReview
        session={makeSession()}
        initialFilter="unanswered"
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    const summary = container.querySelector('.erv-answer-summary')
    expect(summary.textContent).toMatch(/Not answered/)
    expect(summary.textContent).toMatch(/Correct answer/)
    expect(container.querySelector('.erv-result-badge.skipped')).toBeTruthy()
  })

  it('renders the full question stem for unanswered questions', () => {
    render(
      <ExamReview
        session={makeSession()}
        initialFilter="unanswered"
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    expect(screen.getByText('Stem for question q3')).toBeInTheDocument()
  })
})

// ── Test 5: Full question data is preserved through session ───────────────────

describe('ExamReview — full question data present', () => {
  beforeEach(() => vi.clearAllMocks())

  it('all questions have stems visible in all-filter view', () => {
    render(
      <ExamReview
        session={makeSession()}
        initialFilter="all"
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    expect(screen.getByText('Stem for question q1')).toBeInTheDocument()
    expect(screen.getByText('Stem for question q2')).toBeInTheDocument()
    expect(screen.getByText('Stem for question q3')).toBeInTheDocument()
  })

  it('all questions show their explanation', () => {
    render(
      <ExamReview
        session={makeSession()}
        initialFilter="all"
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    expect(screen.getByText('Explanation for q1')).toBeInTheDocument()
    expect(screen.getByText('Explanation for q2')).toBeInTheDocument()
    expect(screen.getByText('Explanation for q3')).toBeInTheDocument()
  })
})

// ── Test 4 (honest): Answer state survives via session.answers[q.id] contract ──

describe('ExamReview — answer-state key-matching contract (Test 4)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('answered correct: same ID in questions and answers → Correct badge, not Unanswered', () => {
    const q = makeQuestion('nbme-q001', 'B')
    const session = {
      id: 's1', mode: 'exam', config: {},
      questions: [q],
      answers: { 'nbme-q001': 'B' },   // key === q.id, value = correct letter
    }
    const { container } = render(
      <ExamReview session={session} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    const badge = container.querySelector('.erv-result-badge')
    expect(badge.textContent).toBe('Correct')
    expect(badge.textContent).not.toBe('Unanswered')
  })

  it('answered wrong: same ID in questions and answers → Incorrect badge, not Unanswered', () => {
    const q = makeQuestion('nbme-q002', 'A')
    const session = {
      id: 's1', mode: 'exam', config: {},
      questions: [q],
      answers: { 'nbme-q002': 'C' },   // key === q.id, value = wrong letter
    }
    const { container } = render(
      <ExamReview session={session} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    const badge = container.querySelector('.erv-result-badge')
    expect(badge.textContent).toBe('Incorrect')
    expect(badge.textContent).not.toBe('Unanswered')
  })

  it('question not in answers → Unanswered badge', () => {
    const q = makeQuestion('nbme-q003', 'A')
    const session = {
      id: 's1', mode: 'exam', config: {},
      questions: [q],
      answers: {},  // nothing stored
    }
    const { container } = render(
      <ExamReview session={session} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    const badge = container.querySelector('.erv-result-badge')
    expect(badge.textContent).toBe('Unanswered')
  })

  it('multi-question session: each card state matches its answers entry', () => {
    const q1 = makeQuestion('id-correct', 'A')
    const q2 = makeQuestion('id-wrong',   'B')
    const q3 = makeQuestion('id-skipped', 'C')
    const session = {
      id: 's1', mode: 'exam', config: {},
      questions: [q1, q2, q3],
      answers: {
        'id-correct': 'A',   // correct
        'id-wrong':   'D',   // wrong
        // id-skipped not in answers
      },
    }
    const { container } = render(
      <ExamReview session={session} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    const badges = container.querySelectorAll('.erv-result-badge')
    expect(badges[0].textContent).toBe('Correct')
    expect(badges[1].textContent).toBe('Incorrect')
    expect(badges[2].textContent).toBe('Unanswered')
  })
})

// ── Test 6: Long review renders all cards ─────────────────────────────────────

describe('ExamReview — long review renders all cards (Test 6)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders 15 cards without crashing', () => {
    const questions = Array.from({ length: 15 }, (_, i) => makeQuestion(`q${i}`, 'A'))
    const answers = questions.reduce(function(acc, q) { acc[q.id] = 'A'; return acc; }, {})
    const session = { id: 's1', mode: 'exam', config: {}, questions, answers }
    const { container } = render(
      <ExamReview session={session} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    expect(container.querySelectorAll('.erv-card').length).toBe(15)
  })

  it('15-card session: all stems visible', () => {
    const questions = Array.from({ length: 15 }, (_, i) => makeQuestion(`q${i}`, 'A'))
    const session = { id: 's1', mode: 'exam', config: {}, questions, answers: {} }
    const { container } = render(
      <ExamReview session={session} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    expect(container.querySelectorAll('.erv-stem').length).toBe(15)
  })

  it('15-card session: each card has a report button', () => {
    const questions = Array.from({ length: 15 }, (_, i) => makeQuestion(`q${i}`, 'A'))
    const session = { id: 's1', mode: 'exam', config: {}, questions, answers: {} }
    render(
      <ExamReview session={session} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    expect(screen.getAllByRole('button', { name: /report/i }).length).toBe(15)
  })

  it('collapses teaching details by default for a long all-questions review', () => {
    const questions = Array.from({ length: 15 }, (_, i) => makeQuestion(`q${i}`, 'A'))
    const session = { id: 's1', mode: 'exam', config: {}, questions, answers: {} }
    render(
      <ExamReview session={session} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )

    expect(screen.getAllByRole('button', { name: 'Show teaching details' })).toHaveLength(15)
    expect(screen.queryByText('Explanation for q0')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Show teaching details' })[0])
    expect(screen.getByText('Explanation for q0')).toBeInTheDocument()
  })

  it('incorrect-filter on long session renders only wrong cards', () => {
    const questions = Array.from({ length: 10 }, (_, i) => makeQuestion(`q${i}`, 'A'))
    // Answer 4 of them wrong (chose B, correct is A)
    const answers = { q0: 'B', q1: 'B', q2: 'B', q3: 'B' }
    const session = { id: 's1', mode: 'exam', config: {}, questions, answers }
    const { container } = render(
      <ExamReview session={session} initialFilter="incorrect" onBack={NOOP} onNewQuiz={NOOP} />
    )
    expect(container.querySelectorAll('.erv-card').length).toBe(4)
  })
})

// ── Test 11: No summary-only cards inside exam-review ────────────────────────

describe('ExamReview — full cards, not summaries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('each card shows the question stem (not just a number)', () => {
    const { container } = render(
      <ExamReview
        session={makeSession()}
        initialFilter="all"
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    const stems = container.querySelectorAll('.erv-stem')
    expect(stems.length).toBe(3)
    stems.forEach(stem => {
      expect(stem.textContent.trim().length).toBeGreaterThan(0)
    })
  })

  it('each card shows answer options', () => {
    const { container } = render(
      <ExamReview
        session={makeSession()}
        initialFilter="all"
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    const optionGroups = container.querySelectorAll('.erv-options')
    expect(optionGroups.length).toBe(3)
    optionGroups.forEach(group => {
      expect(group.querySelectorAll('.erv-opt').length).toBeGreaterThan(0)
    })
  })

  it('each card shows a report button', () => {
    render(
      <ExamReview
        session={makeSession()}
        initialFilter="all"
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    const reportBtns = screen.getAllByRole('button', { name: /report/i })
    expect(reportBtns.length).toBe(3)
  })

  it('renders option dissection for answer choices beyond D', () => {
    const q = makeQuestion('q-five-options', 'E', {
      options: [
        { letter: 'A', text: 'Distractor A' },
        { letter: 'B', text: 'Distractor B' },
        { letter: 'C', text: 'Distractor C' },
        { letter: 'D', text: 'Distractor D' },
        { letter: 'E', text: 'Correct E option' },
      ],
      optionExplanations: {
        A: 'A is incorrect.',
        B: 'B is incorrect.',
        C: 'C is incorrect.',
        D: 'D is incorrect.',
        E: 'E is correct and must be visible in review.',
      },
    })
    const session = { id: 's1', mode: 'exam', config: {}, questions: [q], answers: { 'q-five-options': 'E' } }

    render(<ExamReview session={session} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />)

    expect(screen.getByText('Correct E option')).toBeInTheDocument()
    expect(screen.getByText('E is correct and must be visible in review.')).toBeInTheDocument()
  })

  it('filter buttons change the displayed set without removing stem content', () => {
    render(
      <ExamReview
        session={makeSession()}
        initialFilter="all"
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    // Use start-anchor to match the filter tab "Incorrect 1" not navigator tiles "Question N, incorrect"
    fireEvent.click(screen.getByRole('button', { name: /^Incorrect/i }))
    expect(screen.getByText('Stem for question q2')).toBeInTheDocument()
    expect(screen.queryByText('Stem for question q1')).toBeNull()
  })
})

// ── Question Navigator — exam review wiring ───────────────────────────────────

describe('ExamReview — Question Navigator', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders one navigator tile per question', () => {
    const { container } = render(
      <ExamReview session={makeSession()} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    expect(container.querySelectorAll('.qn-tile').length).toBe(3)
  })

  it('correct question tile shows "correct" state', () => {
    // q1: answered A, correct A → correct
    const { container } = render(
      <ExamReview session={makeSession()} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    expect(container.querySelector('.qn-tile.correct')).toBeTruthy()
  })

  it('incorrect question tile shows "incorrect" state', () => {
    // q2: answered A, correct B → incorrect
    const { container } = render(
      <ExamReview session={makeSession()} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    expect(container.querySelector('.qn-tile.incorrect')).toBeTruthy()
  })

  it('unanswered question tile shows "unanswered" state', () => {
    // q3: not answered
    const { container } = render(
      <ExamReview session={makeSession()} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    expect(container.querySelector('.qn-tile.unanswered')).toBeTruthy()
  })

  it('marked unanswered question shows "marked" state', () => {
    const session = makeSession({
      answers: {},             // all unanswered
      marked: { q2: true },   // q2 marked
    })
    const { container } = render(
      <ExamReview session={session} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    expect(container.querySelector('.qn-tile.marked')).toBeTruthy()
  })

  it('clicking a tile calls scrollIntoView (via mock)', () => {
    render(
      <ExamReview session={makeSession()} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Question 1, correct' }))
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('clicking a tile sets it as the current (focused) tile', () => {
    const { container } = render(
      <ExamReview session={makeSession()} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Question 2, incorrect' }))
    // After clicking Q2, it becomes current
    expect(container.querySelector('.qn-tile.current')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Question 2, current' })).toBeInTheDocument()
  })

  it('navigator renders outside the erv-list (not inside the scrollable container)', () => {
    const { container } = render(
      <ExamReview session={makeSession()} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    const navigator = container.querySelector('.qn-wrap')
    const list      = container.querySelector('.erv-list')
    expect(navigator).toBeTruthy()
    expect(list).toBeTruthy()
    expect(list.contains(navigator)).toBe(false)
  })

  it('clicking a tile for a question not in current filter switches to all and calls scrollIntoView', () => {
    render(
      <ExamReview
        session={makeSession()}
        initialFilter="incorrect"  // only q2 visible
        onBack={NOOP}
        onNewQuiz={NOOP}
      />
    )
    // Click Q1 (correct — not visible in incorrect filter)
    fireEvent.click(screen.getByRole('button', { name: 'Question 1, correct' }))
    // Filter should switch to 'all' — all cards now visible
    expect(screen.getByText('Stem for question q1')).toBeInTheDocument()
  })

  it('each card wrapper has an id matching qnav-{q.id}', () => {
    const { container } = render(
      <ExamReview session={makeSession()} initialFilter="all" onBack={NOOP} onNewQuiz={NOOP} />
    )
    expect(container.querySelector('#qnav-q1')).toBeTruthy()
    expect(container.querySelector('#qnav-q2')).toBeTruthy()
    expect(container.querySelector('#qnav-q3')).toBeTruthy()
  })
})
