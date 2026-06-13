import { getCardStatus, STATUS_COLOR, STATUS_DISPLAY, TAG_COLORS } from './flashcardDisplay'

export function TagBadge({ tag }) {
  const style = TAG_COLORS[tag] ?? TAG_COLORS.Recall
  return <span className="fc-tag-badge" style={style}>{tag || 'Recall'}</span>
}

export function StatusPill({ status }) {
  const key = getCardStatus({ reviewStatus: status })
  const display = STATUS_DISPLAY[key] ?? 'New'
  return (
    <span className="fc-status-pill" style={{ color: STATUS_COLOR[key] ?? 'var(--blue)' }}>
      {display}
    </span>
  )
}
