import { getClinicalPrompt, getCoreMechanism } from '../../lib/storage'
import { getConceptFromTopic, getTopicGroup } from '../../lib/flashcardTopicHelpers.js'

export const TAG_COLORS = {
  Recall:    { background: 'var(--blue-10)',      color: 'var(--blue)'   },
  Mechanism: { background: 'rgba(107,63,189,.1)', color: 'var(--purple)' },
  Trap:      { background: 'rgba(204,58,58,.1)',  color: 'var(--red)'    },
  Mnemonic:  { background: 'rgba(224,123,32,.1)', color: 'var(--orange)' },
  Pearl:     { background: 'rgba(15,173,111,.1)', color: 'var(--green)'  },
}

export const STATUS_COLOR = {
  new:      '#2E64C8',
  learning: 'var(--status-warn)',
  mastered: 'var(--status-stable)',
}

export const STATUS_DISPLAY = { new: 'New', learning: 'Unstable', mastered: 'Mastered' }

export const CARD_PROMPT_LABEL = {
  Recall:   'High-Yield Recall',
  Pearl:    'High-Yield Pearl',
  Trap:     'Critical Distinction',
  Mnemonic: 'Memory Anchor',
}

export const CARD_ANSWER_LABEL = {
  Pearl: 'High-Yield Pearl',
  Trap:  'Critical Distinction',
}

export const EASE_META = [
  { ease: 'again', label: 'Relearn',    hint: 'I missed it',      cls: 'again', color: 'var(--status-critical)' },
  { ease: 'hard',  label: 'Unstable',   hint: 'I guessed / weak', cls: 'hard',  color: 'var(--status-warn)'     },
  { ease: 'good',  label: 'Reinforced', hint: 'I knew it',        cls: 'good',  color: 'var(--status-stable)'   },
  { ease: 'easy',  label: 'Mastered',   hint: 'automatic',        cls: 'easy',  color: '#2E64C8'                },
]

export function conceptPrompt(card) {
  const concept = card?.testedConcept || card?.concept || card?.topicGroup || card?.weakSpotCategory || ''
  const currentPrompt = getClinicalPrompt(card)
  const shouldRepairPrompt =
    card?.generationMethod === 'stemExtraction' ||
    /\b(which management approach|most appropriate next|most likely mechanism for (?:his|her|this|the)|best explains|which of the following)\b/i.test(currentPrompt)

  if (!concept || !shouldRepairPrompt) return currentPrompt

  const dashMatch = concept.match(new RegExp('\\s[\\u2013\\u2014-]\\s'))
  if (dashMatch?.index > -1) {
    const dash = dashMatch.index
    const left = concept.slice(0, dash).trim()
    const right = concept.slice(dash + dashMatch[0].length).trim()
    if (left && right) return `In ${left}, what clinical mechanism explains ${right}?`
  }
  return `What clinical mechanism explains ${concept}?`
}

export function cardAnswer(card) {
  return getCoreMechanism(card)
}

export const getCardStatus = (card) => card.reviewStatus || 'new'

export function isFlashcardDue(card) {
  const s = card.reviewStatus
  // Mastered with no scheduled review: skip (backward compat for old cards)
  if (s === 'mastered' && !card.nextReview) return false
  // New / learning with no schedule: always due
  if (!card.nextReview) return true
  // All cards with a nextReview: due only when the date has passed
  const d = new Date(card.nextReview)
  if (isNaN(d.getTime())) return s !== 'mastered'
  return d <= new Date()
}

export function sortFlashcards(arr, mode) {
  const copy = [...arr]
  switch (mode) {
    case 'due': {
      const STATUS_ORDER = { learning: 0, new: 1, mastered: 4 }
      return copy.sort((a, b) => {
        const ao = a.reviewStatus == null ? 2 : (STATUS_ORDER[a.reviewStatus] ?? 3)
        const bo = b.reviewStatus == null ? 2 : (STATUS_ORDER[b.reviewStatus] ?? 3)
        if (ao !== bo) return ao - bo
        const at = a.reviewedAt ? new Date(a.reviewedAt).getTime() : 0
        const bt = b.reviewedAt ? new Date(b.reviewedAt).getTime() : 0
        return at - bt
      })
    }
    case 'newest':
      return copy.sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return bt - at
      })
    case 'weakest': {
      const RANK = { learning: 1, new: 2, mastered: 4 }
      return copy.sort((a, b) => {
        const ar = a.weakSpotCategory ? 0 : (RANK[getCardStatus(a)] ?? 3)
        const br = b.weakSpotCategory ? 0 : (RANK[getCardStatus(b)] ?? 3)
        if (ar !== br) return ar - br
        const ac = a.sourceMode === 'coach' ? 0 : 1
        const bc = b.sourceMode === 'coach' ? 0 : 1
        return ac - bc
      })
    }
    case 'topic':
      return copy.sort((a, b) => {
        const cmp = getTopicGroup(a).localeCompare(getTopicGroup(b))
        if (cmp !== 0) return cmp
        return getConceptFromTopic(a).localeCompare(getConceptFromTopic(b))
      })
    case 'subject':
      return copy.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''))
    case 'status': {
      const ORDER = { new: 0, learning: 1, mastered: 2 }
      return copy.sort((a, b) => (ORDER[getCardStatus(a)] ?? 0) - (ORDER[getCardStatus(b)] ?? 0))
    }
    default:
      return copy
  }
}
