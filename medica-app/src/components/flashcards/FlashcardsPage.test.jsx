import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FlashcardsPage from './FlashcardsPage'

const FLASHCARDS_KEY = 'medica:flashcards'

const sampleCard = {
  id: 'fc_practice_q1_recall',
  front: 'What is the mechanism of furosemide action?',
  back: 'NKCC2 inhibition blocks sodium reabsorption in the loop of Henle.',
  clinicalPrompt: 'What is the mechanism of furosemide action?',
  coreMechanism: 'NKCC2 inhibition blocks sodium reabsorption in the loop of Henle.',
  tag: 'Recall',
  subject: 'Pharmacology',
  system: 'Renal',
  topic: 'Loop Diuretics',
  reviewStatus: 'new',
  reviewCount: 0,
  sourceMode: 'practice',
  sourceQuestionId: 'q1',
  createdAt: new Date().toISOString(),
  memoryAnchor: 'FURO = Furosemide Urges Renal Output',
  commonTrap: null,
  sourcePearl: null,
  reinforcementPriority: 'normal',
  lastMissedReason: null,
  weakSpotCategory: '',
  topicSlug: 'pharmacology-renal-loop-diuretics',
  rawTopic: 'Loop Diuretics',
  canonicalTopic: 'Loop Diuretics',
  topicGroup: 'Loop Diuretics',
  topicSource: 'direct',
  concept: 'Loop Diuretics',
  testedConcept: 'Loop Diuretics',
}

function seedCards(cards = [sampleCard]) {
  localStorage.setItem(FLASHCARDS_KEY, JSON.stringify(cards))
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

// ── Deck view ─────────────────────────────────────────────────────────────────

describe('FlashcardsPage — deck view labels', () => {
  it('shows "Clinical Reinforcement" as the page title', () => {
    seedCards()
    render(<FlashcardsPage />)
    expect(screen.getByText('Clinical Reinforcement')).toBeInTheDocument()
  })

  it('shows "Reinforcement Library" label in the deck view', () => {
    seedCards()
    render(<FlashcardsPage />)
    const hits = screen.getAllByText('Reinforcement Library')
    expect(hits.length).toBeGreaterThan(0)
  })

  it('shows "Reinforce Now" button when cards are due', () => {
    seedCards()
    render(<FlashcardsPage />)
    expect(screen.getByText('Reinforce Now')).toBeInTheDocument()
  })

  it('shows "Start Reinforcement" button in command header', () => {
    seedCards()
    render(<FlashcardsPage />)
    expect(screen.getByText('Start Reinforcement')).toBeInTheDocument()
  })

  it('shows empty state "No Reinforcement Cards Yet" when deck is empty', () => {
    render(<FlashcardsPage />)
    expect(screen.getByText('No Reinforcement Cards Yet')).toBeInTheDocument()
  })
})

// ── Active review ─────────────────────────────────────────────────────────────

describe('FlashcardsPage — review mode', () => {
  it('shows a board-recall label on the card front', () => {
    seedCards()
    render(<FlashcardsPage />)
    fireEvent.click(screen.getByText('Reinforce Now'))
    expect(screen.getByText('Board Recall')).toBeInTheDocument()
  })

  it('displays the card front text (clinicalPrompt) in review', () => {
    seedCards()
    render(<FlashcardsPage />)
    fireEvent.click(screen.getByText('Reinforce Now'))
    expect(screen.getByText(sampleCard.front)).toBeInTheDocument()
  })

  it('shows "Reveal Mechanism" button before the card is flipped', () => {
    seedCards()
    render(<FlashcardsPage />)
    fireEvent.click(screen.getByText('Reinforce Now'))
    expect(screen.getByText('Reveal Mechanism')).toBeInTheDocument()
  })
})

// ── Ease buttons after reveal ──────────────────────────────────────────────────

describe('FlashcardsPage — ease buttons after reveal', () => {
  function enterReviewAndReveal() {
    seedCards()
    render(<FlashcardsPage />)
    fireEvent.click(screen.getByText('Reinforce Now'))
    fireEvent.click(screen.getByText('Reveal Mechanism'))
  }

  it('shows "Core Mechanism" answer label', () => {
    enterReviewAndReveal()
    expect(screen.getByText('Core Mechanism')).toBeInTheDocument()
  })

  it('displays the card back (coreMechanism) text', () => {
    enterReviewAndReveal()
    expect(screen.getByText(sampleCard.coreMechanism)).toBeInTheDocument()
  })

  it('shows "Relearn" ease button', () => {
    enterReviewAndReveal()
    expect(screen.getByText('Relearn')).toBeInTheDocument()
  })

  it('shows "Unstable" ease button', () => {
    enterReviewAndReveal()
    // "Unstable" appears in ease buttons and in the stats row — getAll works
    const hits = screen.getAllByText('Unstable')
    expect(hits.length).toBeGreaterThan(0)
  })

  it('shows "Reinforced" ease button', () => {
    enterReviewAndReveal()
    expect(screen.getByText('Reinforced')).toBeInTheDocument()
  })

  it('shows "Mastered" ease button', () => {
    enterReviewAndReveal()
    const hits = screen.getAllByText('Mastered')
    expect(hits.length).toBeGreaterThan(0)
  })

  it('shows keyboard hint with renamed labels', () => {
    enterReviewAndReveal()
    expect(screen.getByText('1 Relearn · 2 Unstable · 3 Reinforced · 4 Mastered')).toBeInTheDocument()
  })
})

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────

describe('FlashcardsPage — keyboard shortcuts', () => {
  it('Space reveals the mechanism', () => {
    seedCards()
    render(<FlashcardsPage />)
    fireEvent.click(screen.getByText('Reinforce Now'))
    expect(screen.getByText('Reveal Mechanism')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByText('Relearn')).toBeInTheDocument()
  })

  it('Escape exits review mode and returns to deck view', () => {
    seedCards()
    render(<FlashcardsPage />)
    fireEvent.click(screen.getByText('Reinforce Now'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByText('Clinical Reinforcement')).toBeInTheDocument()
    expect(screen.queryByText('Reveal Mechanism')).not.toBeInTheDocument()
  })
})

// ── Memory anchor and common trap rendering ────────────────────────────────────

describe('FlashcardsPage — memory anchor and trap rendering', () => {
  it('shows "Memory Anchor" label and text after reveal when card has memoryAnchor', () => {
    const cardWithAnchor = { ...sampleCard, memoryAnchor: 'FURO = Furosemide Urges Renal Output' }
    seedCards([cardWithAnchor])
    render(<FlashcardsPage />)
    fireEvent.click(screen.getByText('Reinforce Now'))
    fireEvent.click(screen.getByText('Reveal Mechanism'))
    expect(screen.getByText('Memory Anchor')).toBeInTheDocument()
    expect(screen.getByText('FURO = Furosemide Urges Renal Output')).toBeInTheDocument()
  })

  it('does not show "Memory Anchor" section when card has no memoryAnchor', () => {
    const cardNoAnchor = { ...sampleCard, memoryAnchor: null }
    seedCards([cardNoAnchor])
    render(<FlashcardsPage />)
    fireEvent.click(screen.getByText('Reinforce Now'))
    fireEvent.click(screen.getByText('Reveal Mechanism'))
    expect(screen.queryByText('Memory Anchor')).not.toBeInTheDocument()
  })

  it('shows "Common Trap" label and text after reveal when card has commonTrap', () => {
    const cardWithTrap = { ...sampleCard, commonTrap: 'Loop diuretics do not act on the DCT.' }
    seedCards([cardWithTrap])
    render(<FlashcardsPage />)
    fireEvent.click(screen.getByText('Reinforce Now'))
    fireEvent.click(screen.getByText('Reveal Mechanism'))
    expect(screen.getByText('Common Trap')).toBeInTheDocument()
    expect(screen.getByText('Loop diuretics do not act on the DCT.')).toBeInTheDocument()
  })

  it('does not show "Common Trap" section when card has no commonTrap', () => {
    seedCards([{ ...sampleCard, commonTrap: null }])
    render(<FlashcardsPage />)
    fireEvent.click(screen.getByText('Reinforce Now'))
    fireEvent.click(screen.getByText('Reveal Mechanism'))
    expect(screen.queryByText('Common Trap')).not.toBeInTheDocument()
  })
})

// ── Session done ───────────────────────────────────────────────────────────────

describe('FlashcardsPage — session done screen', () => {
  function completeSession() {
    seedCards()
    render(<FlashcardsPage />)
    fireEvent.click(screen.getByText('Reinforce Now'))
    fireEvent.click(screen.getByText('Reveal Mechanism'))
    fireEvent.click(screen.getByRole('button', { name: 'Mastered: Nailed it' }))
  }

  it('shows "Reinforcement Complete" headline', () => {
    completeSession()
    expect(screen.getByText('Reinforcement Complete')).toBeInTheDocument()
  })

  it('shows "Reinforce Again" button', () => {
    completeSession()
    expect(screen.getByText('Reinforce Again')).toBeInTheDocument()
  })

  it('shows "Back to Library" button', () => {
    completeSession()
    expect(screen.getByText('Back to Library')).toBeInTheDocument()
  })
})
