import { useEffect } from 'react'

/**
 * Non-blocking slide-out notes drawer (per-question scratch pad).
 * @param {{ isOpen: boolean, onClose: () => void, questionId: string, notes: object, onNotesChange: (id: string, val: string) => void }} props
 */
export default function NotesDrawer({ isOpen, onClose, questionId, notes, onNotesChange }) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="quiz-drawer notes-drawer" role="complementary" aria-label="Notes">
      <div className="quiz-drawer-hdr">
        <span className="quiz-drawer-title">Notes</span>
        <button type="button" className="quiz-drawer-close" onClick={onClose} aria-label="Close notes">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div className="quiz-drawer-body notes-body">
        <textarea
          className="quiz-notes-area"
          placeholder="Scratch notes for this question..."
          value={notes[questionId] || ''}
          onChange={e => onNotesChange(questionId, e.target.value)}
          aria-label="Question scratch pad"
          autoFocus
        />
        <div className="quiz-notes-footer">Session only — not saved to server</div>
      </div>
    </div>
  )
}
