import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import PracticeReviewCard from './PracticeReviewCard'

describe('PracticeReviewCard', () => {
  it('renders rare longer option sets and scores an E answer correctly', () => {
    const { container } = render(
      <PracticeReviewCard
        question={{
          id: 'practice-rare-five',
          stem: 'A longer option-set review item?',
          subject: 'Pathology',
          system: 'Cardiovascular',
          difficulty: 'Balanced',
          options: [
            { letter: 'A', text: 'Alpha distractor' },
            { letter: 'B', text: 'Beta distractor' },
            { letter: 'C', text: 'Gamma distractor' },
            { letter: 'D', text: 'Delta distractor' },
            { letter: 'E', text: 'Correct fifth answer' },
          ],
          correct: 'E',
          explanation: 'Correct fifth answer is the best answer.',
        }}
        userAnswer="E"
        questionNumber={1}
      />,
    )

    expect(screen.getByText('Correct fifth answer')).toBeInTheDocument()
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(container.querySelector('.prv-opt.correct')?.textContent).toContain('Correct fifth answer')
  })

  it('renders the option E explanation in the Option Dissection panel', () => {
    render(
      <PracticeReviewCard
        question={{
          id: 'practice-rare-five-expl',
          stem: 'A longer option-set review item with an option explanation?',
          options: [
            { letter: 'A', text: 'Alpha distractor' },
            { letter: 'B', text: 'Beta distractor' },
            { letter: 'C', text: 'Gamma distractor' },
            { letter: 'D', text: 'Delta distractor' },
            { letter: 'E', text: 'Correct fifth answer' },
          ],
          correct: 'E',
          explanation: 'Correct fifth answer is the best answer.',
          optionExplanations: {
            A: 'Alpha is incorrect because it does not fit the vignette.',
            E: 'Correct fifth answer is correct because it matches the key finding.',
          },
        }}
        userAnswer="E"
        questionNumber={1}
      />,
    )

    expect(screen.getByText('Option Dissection')).toBeInTheDocument()
    expect(screen.getByText('Correct fifth answer is correct because it matches the key finding.')).toBeInTheDocument()
    expect(screen.getByText('Alpha is incorrect because it does not fit the vignette.')).toBeInTheDocument()
  })

  it('shows a wrong user answer against a correct answer of E', () => {
    const { container } = render(
      <PracticeReviewCard
        question={{
          id: 'practice-rare-five-wrong',
          stem: 'A longer option-set review item answered incorrectly?',
          options: [
            { letter: 'A', text: 'Alpha distractor' },
            { letter: 'B', text: 'Beta distractor' },
            { letter: 'C', text: 'Gamma distractor' },
            { letter: 'D', text: 'Delta distractor' },
            { letter: 'E', text: 'Correct fifth answer' },
          ],
          correct: 'E',
          explanation: 'Correct fifth answer is the best answer.',
        }}
        userAnswer="A"
        questionNumber={1}
      />,
    )

    expect(screen.getByText('Incorrect')).toBeInTheDocument()
    expect(container.querySelector('.prv-opt.wrong')?.textContent).toContain('Alpha distractor')
    expect(container.querySelector('.prv-opt.correct')?.textContent).toContain('Correct fifth answer')
  })
})
