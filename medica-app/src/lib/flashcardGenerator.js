import { resolveFlashcardTopicMetadata, slugifyTopic } from './topicIntelligence.js'
import { normalizeAnswerLetter } from './answerNormalize.js'

/**
 * @typedef {{
 *   id: string
 *   front: string
 *   back: string
 *   clinicalPrompt: string
 *   coreMechanism: string
 *   tag: string
 *   subject: string
 *   system: string
 *   topic: string
 *   weakSpotCategory?: string
 *   memoryAnchor?: string|null
 *   commonTrap?: string|null
 *   sourcePearl?: string|null
 *   reinforcementPriority: 'high'|'medium'|'normal'
 *   sourceQuestionId: string
 *   sourceMode: 'practice' | 'coach'
 *   createdAt: string
 *   reviewedAt?: string
 *   reviewStatus: 'new' | 'learning' | 'mastered'
 *   ease?: 'again' | 'hard' | 'good' | 'easy'
 *   reviewCount: number
 *   lastMissedReason?: string|null
 * }} Flashcard
 */

// ─── Basic utilities ──────────────────────────────────────────────────────────

function getUserAnswer(session, questionId) {
  const { answers = {} } = session
  return answers[questionId] ?? null
}

function getCorrectAnswer(q) {
  return normalizeAnswerLetter(q.correctAnswer ?? q.correct)
}

function getMissedQuestions(session) {
  const { questions = [] } = session
  return questions.filter(q => {
    const userAnswer =
      getUserAnswer(session, q.id) ??
      q.userAnswer ?? q.user_answer ?? q.selectedAnswer ?? null
    const normUser  = normalizeAnswerLetter(userAnswer)
    const correct   = getCorrectAnswer(q)
    return !normUser || normUser !== correct
  })
}

// Get text for any option letter (A/B/C/D)
function getOptionText(q, letter) {
  if (!letter) return ''
  const opts = q.options
  if (!opts) return ''
  if (Array.isArray(opts)) {
    const idx = letter.charCodeAt(0) - 65
    const opt = opts[idx]
    if (typeof opt === 'string') return opt.trim()
    if (opt && typeof opt === 'object') return (opt.text || opt.label || '').trim()
    return ''
  }
  if (typeof opts === 'object') return String(opts[letter] || '').trim()
  return ''
}

function getCorrectOptionText(q) {
  return getOptionText(q, getCorrectAnswer(q))
}

// Truncate to max N words, appending ellipsis if cut
function capWords(text, n) {
  if (!text) return ''
  const words = text.trim().split(/\s+/)
  if (words.length <= n) return text.trim()
  return words.slice(0, n).join(' ') + '…'
}

// First sentence of text, hard-capped at maxWords words.
// Splits on punctuation followed by space + uppercase to avoid breaking on
// abbreviation periods like "E. coli" or "vs."
function oneSentence(text, maxWords = 15) {
  if (!text) return ''
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z])/)
  const s = parts[0].trim()
  return capWords(s, maxWords)
}

// Normalize a string to a stable dedup key
function normKey(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

// ─── Sanitizer ────────────────────────────────────────────────────────────────

const SANITIZE_PATTERNS = [
  /\s*\(from\s+stem[^)]*\)/gi,
  /\s*\(generic\s+fallback[^)]*\)/gi,
  /\s*\(generated\s+fallback[^)]*\)/gi,
  /\s*\(debug[^)]*\)/gi,
  /\s*\(source:[^)]*\)/gi,
  /\bfrom\s+stem\s+extraction\b/gi,
  /\bfrom\s+stem\b/gi,
  /\bextracted\s+from\s+stem\b/gi,
  /\bgeneric\s+fallback\b/gi,
  /\bgenerated\s+fallback\b/gi,
  /\bdebug:/gi,
  /\bsource:\s*/gi,
]

/**
 * Strips any internal/debug annotations from student-facing card text.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeFlashcardText(text) {
  if (!text) return ''
  let s = text
  for (const pat of SANITIZE_PATTERNS) {
    s = s.replace(pat, '')
  }
  // Collapse extra whitespace and clean trailing punctuation artifacts
  s = s.replace(/\s{2,}/g, ' ').replace(/^[,;\s]+|[,;\s]+$/g, '').trim()
  return s
}

// ─── Stem question extraction ─────────────────────────────────────────────────

// Phrases that make a stem question context-dependent (requires the vignette)
const STEM_VAGUE_RE = /\b(this patient|this individual|this person|this child|this man|this woman|the patient|in this case|in this scenario|best next step|next best step|next step in management|most appropriate next|initial management of this|what should be done)\b/i

/**
 * Extracts the actual test question from a USMLE-style stem.
 * USMLE stems end with the question sentence. Returns '' if the question
 * is too vague (context-dependent) or too long for a standalone flashcard.
 */
function extractStemQuestion(stem) {
  if (!stem) return ''
  // Collect all question-mark sentences
  const sentences = stem.match(/[^.!?]+\?/g)
  if (!sentences?.length) return ''
  const raw = sentences[sentences.length - 1].trim()

  // Reject context-dependent or management questions
  if (STEM_VAGUE_RE.test(raw)) return ''

  const cleaned = raw
    .replace(/\bWhich of the following\s+/gi, 'What ')
    .replace(/\bWhich of these\s+/gi, 'What ')
    .replace(/^What\s+correctly identifies\b/i, 'What is')
    .replace(/^What\s+best (?:describes|characterizes|represents)\b/i, 'What is')
    .replace(/\bMOST LIKELY\b/g, 'most likely')
    .replace(/\bBEST\b/g, 'best')
    .replace(/\s+/g, ' ')
    .trim()

  const wordCount = cleaned.split(/\s+/).length
  if (wordCount < 4 || wordCount > 16) return ''
  return cleaned
}

// ─── Mechanism sentence extraction ───────────────────────────────────────────

// Detects causal / mechanistic language in explanation sentences
const MECHANISM_SENTENCE_RE = /[→↑↓]|\bcause[sd]?\b|\bleads? to\b|\bresults? in\b|\bbecause\b|\baccumulation\b|\binhibition\b|\bactivation\b|\bblocking\b|\bmediated\b|\bvia\b|\bdue to\b|\bpathway\b|\bimpair\w*\b|\bblocks?\b|\bincreases?\b|\bdecreases?\b|\bthrough\b|\bproduction\b|\bconversion\b|\buptake\b/i

/**
 * Finds the first sentence in the explanation that contains mechanism language.
 * Returns a capped string or '' if none found.
 * Splits on punctuation + space + uppercase to avoid breaking on abbreviation
 * periods like "E. coli".
 */
function extractMechanismSentence(explanation) {
  if (!explanation) return ''
  const sentences = explanation.split(/(?<=[.!?])\s+(?=[A-Z])/)
  for (const s of sentences) {
    const trimmed = s.trim()
    if (!MECHANISM_SENTENCE_RE.test(trimmed)) continue
    const words = trimmed.split(/\s+/).filter(Boolean)
    if (words.length >= 4 && words.length <= 28) return capWords(trimmed, 15)
  }
  return ''
}

// ─── Meta-learning front detection ───────────────────────────────────────────

// Fronts that read as educational narration rather than board-style retrieval.
// Caught in tryAdd before the card is stored — these are never acceptable.
const META_FRONT_RE = /\bwhat mistake\b|\bwhat aspect\b|\bwhat issue\b|\bwhat confusion\b|\bhow do you remember\b|\bhigh.yield pearl for\b|\bwhat concept\b|\bstudent\w*\s+(?:make|often|confuse)\b/i

// ─── Front-text builders ──────────────────────────────────────────────────────

// Each rule maps a concept keyword to a concrete board-style question + card category.
const FRONT_KEYWORD_RULES = [
  { re: /\b(mechanism|moa|mode of action|mechanism of action)\b/i, fn: (c) => `What is the mechanism of ${c}?`,          category: 'Mechanism' },
  { re: /\b(side effect|adverse|toxicity|tox)\b/i,                 fn: (c) => `What is a key side effect of ${c}?`,      category: 'Side effect mechanism' },
  { re: /\b(complication)\b/i,                                      fn: (c) => `What is a complication of ${c}?`,        category: 'Clinical consequence' },
  { re: /\b(dose|dosing|dosage)\b/i,                                fn: (c) => `What is the standard dose of ${c}?`,     category: 'Treatment trigger' },
  { re: /\b(treat|treatment|management|therapy)\b/i,               fn: (c) => `How is ${c} treated?`,                   category: 'Treatment trigger' },
  { re: /\b(diagnos|presentation|presents)\b/i,                    fn: (c) => `How does ${c} present?`,                 category: 'Diagnostic clue' },
  { re: /\b(cause|etiology|pathophysiology)\b/i,                   fn: (c) => `What causes ${c}?`,                      category: 'Mechanism' },
  { re: /\b(site of action|site)\b/i,                              fn: (c) => `What is the site of action of ${c}?`,    category: 'Mechanism' },
  { re: /\b(inhibit|block)\b/i,                                    fn: (c) => `What does ${c} inhibit?`,                category: 'Mechanism' },
  { re: /\b(indication|used for)\b/i,                              fn: (c) => `What is ${c} indicated for?`,            category: 'Most tested association' },
  { re: /\bcontraindic\w*\b|\bavoid\b/i,                            fn: (c) => `When is ${c} contraindicated?`,          category: 'Contraindication' },
  { re: /\b(first.?line)\b/i,                                      fn: (c) => `What is ${c} first-line for?`,          category: 'Treatment trigger' },
  { re: /\b(classic|finding|sign|symptom)\b/i,                     fn: (c) => `What is the classic finding in ${c}?`,   category: 'Pathognomonic finding' },
  { re: /\b(function|role)\b/i,                                    fn: (c) => `What is the function of ${c}?`,          category: 'Mechanism' },
  { re: /\b(step|pathway|process)\b/i,                             fn: (c) => `What is the key step in ${c}?`,          category: 'Mechanism' },
  { re: /\b(deficiency)\b/i,                                       fn: (c) => `What is the clinical consequence of ${c}?`, category: 'Clinical consequence' },
]

// Dash format is only used when the right side is a clinical aspect qualifier —
// e.g. "HMG-CoA reductase — statin mechanism" (right = aspect) is fine,
// but "Staphylococcus aureus toxin — scalded skin syndrome" (right = disease) is not.
const DASH_ASPECT_RE = /\b(mechanism|moa|mode of action|treatment|therapy|management|pathophysiology|etiology|diagnosis|pharmacology|physiology|function|role|pathway|process|side effect|toxicity|complication|presentation|finding|sign|symptom|indication|contraindication)\b/i

// Restricted keyword rules for trap fronts. Excludes "cause/etiology" (reversed causality)
// and "inhibit/block" (directionally ambiguous in trap text). Uses "cause" with the
// REVERSED template — "What does X cause?" — to match "Statins cause myopathy" correctly.
const TRAP_KEYWORD_RULES = [
  { re: /\bcontraindic\w*\b|\bavoid\b/i,                              fn: (c) => `When is ${c} contraindicated?`,      category: 'Contraindication' },
  { re: /\b(side effect|adverse|toxicity|tox)\b/i,                   fn: (c) => `What is a key side effect of ${c}?`, category: 'Side effect mechanism' },
  { re: /\b(complication)\b/i,                                        fn: (c) => `What is a complication of ${c}?`,    category: 'Clinical consequence' },
  { re: /\b(treat|treatment|management|therapy)\b/i,                 fn: (c) => `How is ${c} treated?`,               category: 'Treatment trigger' },
  { re: /\b(diagnos|presentation|presents)\b/i,                      fn: (c) => `How does ${c} present?`,             category: 'Diagnostic clue' },
  { re: /\b(first.?line)\b/i,                                         fn: (c) => `What is ${c} first-line for?`,      category: 'Treatment trigger' },
  { re: /\b(mechanism|moa|mode of action|mechanism of action)\b/i,   fn: (c) => `What is the mechanism of ${c}?`,     category: 'Mechanism' },
]

// Strips trailing keyword nouns from testedConcept so "Furosemide mechanism"
// becomes "Furosemide" in the generated question, and uses only the left side
// of dash-format concepts (e.g. "HMG-CoA reductase — statin mechanism" → "HMG-CoA reductase").
const CONCEPT_SUFFIX_RE = /\s*\b(mechanism|moa|mode of action|treatment|therapy|management|pathophysiology|etiology|diagnosis|pharmacology|physiology)\s*$/i

function getQueryConcept(concept) {
  const dashIdx = concept.indexOf(' — ')
  const base = dashIdx > -1 ? concept.slice(0, dashIdx).trim() : concept
  return base.replace(CONCEPT_SUFFIX_RE, '').trim() || base
}

/**
 * Builds the Recall card front.
 * Priority: stem question → testedConcept dash → keyword rules → generic fallback.
 * Returns { front, method, category } — method and category are metadata only.
 * @param {string} concept  — q.testedConcept or derived fallback
 * @param {string} [stem]   — q.stem
 * @returns {{ front: string, method: string, category: string }}
 */
function buildRecallFront(concept, stem) {
  const stemQ = extractStemQuestion(stem)
  if (stemQ) return { front: stemQ, method: 'stemExtraction', category: 'Board Recall' }

  if (!concept) return { front: 'What mechanism is tested in this clinical scenario?', method: 'fallback', category: 'Mechanism' }

  // Dash format: "Drug — aspect" → "What is the aspect of Drug?"
  // Only fires when right side is a clinical aspect, not a disease name.
  const dash = concept.indexOf(' — ')
  if (dash > -1) {
    const left  = concept.slice(0, dash).trim()
    const right = concept.slice(dash + 3).trim()
    if (DASH_ASPECT_RE.test(right)) {
      return { front: `What is the ${right} of ${left}?`, method: 'dashFormat', category: 'Classic board association' }
    }
  }

  // Keyword rules — use cleaned concept so "Furosemide mechanism" → "What is the mechanism of Furosemide?"
  const queryConcept = getQueryConcept(concept)
  for (const { re, fn, category } of FRONT_KEYWORD_RULES) {
    if (re.test(concept)) return { front: fn(queryConcept), method: 'keywordRule', category }
  }

  return { front: `What mechanism is tested by ${queryConcept}?`, method: 'fallback', category: 'Mechanism' }
}

/**
 * Builds the Recall card back — mechanism first.
 * Priority: mechanism sentence from explanation → descriptive option text → explanation fallback.
 * Mechanism-first ensures backs explain WHY rather than just naming a term.
 */
function buildRecallBack(q) {
  // 1. Prefer a mechanism-focused sentence from the explanation
  const mechSentence = extractMechanismSentence(q.explanation)
  if (mechSentence) return mechSentence
  // 2. Option text — only if substantive (≥4 words), not a single buzzword
  const optText = getCorrectOptionText(q)
  if (optText && optText.split(/\s+/).filter(Boolean).length >= 4) return optText
  // 3. First sentence of explanation as last resort
  return oneSentence(q.explanation, 15)
}

/**
 * Builds a Pearl card front by pattern-matching the pearl text against FRONT_KEYWORD_RULES.
 * Returns { front: '', category: '' } when no clinical pattern is recognisable.
 * Uses the left side of dash concepts and strips trailing keyword nouns to avoid
 * questions like "What is first-line for Furosemide mechanism?".
 */
function buildPearlFront(concept, pearl) {
  if (!pearl) return { front: '', category: '' }
  const queryConcept = getQueryConcept(concept)
  for (const { re, fn, category } of FRONT_KEYWORD_RULES) {
    if (re.test(pearl)) return { front: fn(queryConcept), category }
  }
  return { front: '', category: '' }
}

/**
 * Builds a Trap card front by pattern-matching the trap text against TRAP_KEYWORD_RULES.
 * Uses a restricted rule set that handles causality correctly — "Statins cause myopathy"
 * becomes "What does X cause?" not "What causes X?".
 * Returns { front: '', category: '' } when no pattern matches.
 */
function buildTrapFront(concept, commonTrap) {
  if (!commonTrap) return { front: '', category: '' }
  const queryConcept = getQueryConcept(concept)
  for (const { re, fn, category } of TRAP_KEYWORD_RULES) {
    if (re.test(commonTrap)) return { front: fn(queryConcept), category }
  }
  return { front: '', category: '' }
}

// ─── Core generator ───────────────────────────────────────────────────────────

/**
 * Produces up to 3 Anki-style cards per missed question, in priority order:
 *   1. Recall         — always (stem question → concept dash → keyword → fallback)
 *   2. Pearl          — when q.pearl / q.highYieldPearl present
 *   3. Trap           — when q.commonTrap present
 *      Wrong-answer   — when no commonTrap but wrong option text identifiable
 *   4. Mnemonic       — when q.memoryAnchor present (fills remaining slot if < 3)
 *
 * Front: max 16 words. Back: max 1 sentence / 15 words.
 * Session-level dedup on normalized front prevents repeats across questions.
 *
 * @param {import('./quizTypes').QuizSession} session
 * @param {'practice' | 'coach'} sourceMode
 * @returns {Flashcard[]}
 */
export function generateFlashcardsFromWrongQuestions(session, sourceMode) {
  if (!session || !Array.isArray(session.questions)) return []

  const missed = getMissedQuestions(session)
  const cards = []
  const now = new Date().toISOString()
  const sessionFronts = new Set()

  for (const q of missed) {
    const concept    = q.testedConcept || `${q.subject || ''} ${q.system || ''}`.trim()
    const topicMeta  = resolveFlashcardTopicMetadata(q, session)
    const rawTopicStr = topicMeta.canonicalTopic || topicMeta.rawTopic || ''
    const topicGroup = rawTopicStr && rawTopicStr !== 'General'
      ? (rawTopicStr.includes(' — ') ? rawTopicStr.split(' — ')[0].trim() : rawTopicStr)
      : (q.testedConcept?.includes(' — ')
          ? q.testedConcept.split(' — ')[0].trim()
          : q.testedConcept || q.weakSpotCategory || '')

    const subjectVal = q.subject || topicMeta.subject || ''
    const systemVal  = q.system  || topicMeta.system  || ''
    const builtSlug  = topicGroup
      ? [subjectVal, systemVal, topicGroup]
          .filter(v => v && v !== 'General')
          .map(v => slugifyTopic(v))
          .join('-')
      : topicMeta.topicSlug || ''

    const base = {
      subject:          subjectVal,
      system:           systemVal,
      topic:            topicMeta.topic,
      rawTopic:         topicMeta.rawTopic,
      canonicalTopic:   topicMeta.canonicalTopic,
      topicSlug:        builtSlug || topicMeta.topicSlug,
      topicSource:      topicMeta.topicSource,
      topicGroup:       topicGroup,
      concept:          q.testedConcept || '',
      testedConcept:    q.testedConcept || '',
      weakSpotCategory: q.weakSpotCategory || '',
      memoryAnchor:     q.memoryAnchor   || null,
      commonTrap:       q.commonTrap     || null,
      sourcePearl:      q.pearl || q.highYieldPearl || null,
      reinforcementPriority: q.weakSpotCategory ? 'high' : sourceMode === 'coach' ? 'medium' : 'normal',
      lastMissedReason: null,
      sourceQuestionId: q.id,
      sourceMode,
      createdAt:    now,
      reviewStatus: 'new',
      reviewCount:  0,
    }

    const questionCards = []

    // method and category are internal metadata — never placed inside front/back text
    function tryAdd(id, tag, questionAngle, front, back, method, category) {
      if (!front || !back) return
      const cleanFront = sanitizeFlashcardText(capWords(front, 16))
      const cleanBack  = sanitizeFlashcardText(oneSentence(back, 15))
      if (!cleanFront || !cleanBack) return
      if (META_FRONT_RE.test(cleanFront)) return
      const key = normKey(cleanFront)
      if (sessionFronts.has(key)) return
      sessionFronts.add(key)
      questionCards.push({
        id,
        ...base,
        tag,
        cardCategory:     category || '',
        questionAngle,
        generationMethod: method || 'direct',
        front:          cleanFront,
        back:           cleanBack,
        // Aliases for the new clinical reinforcement field names.
        // Backward-compat: front/back remain populated for storage dedup and old card reads.
        clinicalPrompt: cleanFront,
        coreMechanism:  cleanBack,
      })
    }

    // 1. Recall — always
    const { front: recallFront, method: recallMethod, category: recallCategory } = buildRecallFront(concept, q.stem)
    tryAdd(
      `fc_${sourceMode}_${q.id}_recall`,
      'Recall', 'recall',
      recallFront,
      buildRecallBack(q),
      recallMethod,
      recallCategory,
    )

    // 2. Pearl — only when the text contains a recognisable clinical pattern
    const pearlText = q.pearl || q.highYieldPearl
    if (pearlText && questionCards.length < 3) {
      const { front: pearlFront, category: pearlCategory } = buildPearlFront(concept, pearlText)
      tryAdd(
        `fc_${sourceMode}_${q.id}_pearl`,
        'Pearl', 'high-yield pearl',
        pearlFront,
        pearlText,
        'pearl',
        pearlCategory,
      )
    }

    // 3a. Trap (explicit) — only when the trap text contains a recognisable clinical pattern
    if (q.commonTrap && questionCards.length < 3) {
      const { front: trapFront, category: trapCategory } = buildTrapFront(concept, q.commonTrap)
      tryAdd(
        `fc_${sourceMode}_${q.id}_trap`,
        'Trap', 'common trap',
        trapFront,
        q.commonTrap,
        'commonTrap',
        trapCategory,
      )
    }

    // 3b. Wrong-answer trap — only for term-like options (≤4 words); long phrases make poor fronts
    if (!q.commonTrap && questionCards.length < 3) {
      const wrongLetter  = getUserAnswer(session, q.id) ??
        q.userAnswer ?? q.user_answer ?? q.selectedAnswer ?? null
      const rightLetter  = getCorrectAnswer(q)
      if (wrongLetter && wrongLetter !== rightLetter) {
        const wrongRaw   = getOptionText(q, wrongLetter)
        const correctRaw = getCorrectOptionText(q)
        const wrongWords = wrongRaw.split(/\s+/).filter(Boolean).length
        const rightWords = correctRaw.split(/\s+/).filter(Boolean).length
        if (wrongRaw && correctRaw && wrongWords <= 4 && rightWords <= 4) {
          tryAdd(
            `fc_${sourceMode}_${q.id}_wrongtrap`,
            'Trap', 'wrong answer',
            `What distinguishes ${capWords(correctRaw, 4)} from ${capWords(wrongRaw, 4)}?`,
            correctRaw,
            'wrongAnswer',
            'Dangerous confusion',
          )
        }
      }
    }

    cards.push(...questionCards)
  }

  return cards
}

/**
 * Generate flashcards from a completed Coach session's wrong/unanswered questions.
 * @param {import('./quizTypes').QuizSession} session
 * @returns {Flashcard[]}
 */
export function generateFlashcardsFromCoachSession(session) {
  return generateFlashcardsFromWrongQuestions(session, 'coach')
}

/**
 * Generate flashcards from a completed Practice session's mistakes.
 * @param {import('./quizTypes').QuizSession} session
 * @returns {Flashcard[]}
 */
export function generateFlashcardsFromPracticeMistakes(session) {
  return generateFlashcardsFromWrongQuestions(session, 'practice')
}
