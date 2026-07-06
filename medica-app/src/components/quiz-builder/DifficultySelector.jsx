import {
  PUBLIC_DIFFICULTIES,
  getPublicDifficultyId,
  resolveDifficultyForMode,
} from '../../lib/quizTypes'

const MODE_DIFFICULTY_COPY = {
  Foundation: {
    exam:     'Lower-complexity timed questions for building test-day confidence.',
    practice: 'Lower-complexity questions with immediate feedback for concept building.',
    coach:    'Lower-complexity questions with guided teaching and repair.',
  },
  Balanced: {
    exam:     'Standard timed Step 1 practice for mixed blocks.',
    practice: 'Standard Step 1 practice with immediate explanation after each answer.',
    coach:    'Standard Step 1 practice with deeper coaching support.',
  },
  Challenge: {
    exam:     'Harder, concise exam-style questions with review after the block.',
    practice: 'Harder questions with richer explanations after each answer.',
    coach:    'Harder questions with deep teaching, traps, and weak-spot repair.',
  },
}

/** @param {{ value: string, mode: string, onChange: (v: string) => void }} props */
export default function DifficultySelector({ value, mode, onChange }) {
  const publicValue = getPublicDifficultyId(value)
  const selected = PUBLIC_DIFFICULTIES.find(d => d.id === publicValue)
  const selectedDesc = MODE_DIFFICULTY_COPY[publicValue]?.[mode] || selected?.desc

  return (
    <div className="qb-field">
      <div className="qb-field-lbl">Difficulty</div>
      <div className="qb-diff-hint-top">Choose how hard the questions should feel.</div>
      <div className="qb-diffs">
        {PUBLIC_DIFFICULTIES.map(d => (
          <button
            key={d.id}
            type="button"
            className={`qb-diff${publicValue === d.id ? ' active' : ''}`}
            onClick={() => onChange(resolveDifficultyForMode(d.id, mode))}
            aria-pressed={publicValue === d.id}
          >
            {d.label}
          </button>
        ))}
      </div>
      {selectedDesc && (
        <div className="qb-diff-desc">{selectedDesc}</div>
      )}
    </div>
  )
}
