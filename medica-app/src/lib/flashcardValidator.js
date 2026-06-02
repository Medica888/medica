// Pure validation for clinical reinforcement cards.
// No imports, no DOM dependencies — fully unit-testable.

// Aspect qualifiers that make a "What is X?" front acceptable
const ASPECT_RE = /\b(mechanism|moa|mode of action|side effect|adverse|toxicity|tox|complication|treat(?:ment|s)?|therapy|diagnos\w*|presentation|presents|cause[sd]?|etiology|pathophysiology|site of action|inhibit\w*|block\w*|target|indication|contraindication|first.?line|finding|sign|symptom|pearl|trap|mistake\w*|confused|distinguish|differ\w*|mediator|accumulate\w*|pathway|process|step|function|role|clinical|cue|prompt|activation|inhibition|deficiency|excess|secretion|receptor|transporter|precursor|conversion|mediates|impair\w*)\b/i

// Pure "define X" question patterns — only acceptable when an aspect qualifier is present
const BARE_DEF_RE = /^(what is|what are|what does|define|describe)\s+/i

// Mechanism / causal language that makes back text substantive
const MECHANISM_RE = /[→↑↓]|\bcause[sd]?\b|\bleads? to\b|\bresults? in\b|\bbecause\b|\baccumulation\b|\binhibition\b|\bactivation\b|\bblocking\b|\bmediated by\b|\bvia\b|\bdue to\b|\bsignaling\b|\bpathway\b|\bimpair\w*\b|\bfailure\b|\bexcess\b|\bdeficiency\b|\bprevents?\b|\bblocks?\b|\bincreases?\b|\bdecreases?\b|\bstimulat\w*\b|\bsuppress\w*\b|\bthrough\b|\bproduction\b|\bconversion\b|\buptake\b|\breduction\b|\bfrom\b/i

// Educational-narration fronts that are never acceptable on board-style cards
const META_FRONT_RE = /\bwhat mistake\b|\bwhat aspect\b|\bwhat issue\b|\bwhat confusion\b|\bhow do you remember\b|\bhigh.yield pearl for\b|\bwhat concept\b|\bstudent\w*\s+(?:make|often|confuse)\b/i

// Unresolved-pronoun fronts: "this adverse effect", "this condition", etc.
// A card front MUST be answerable in isolation — the drug, disease, and concept
// must appear explicitly. Any "this/these/it/they + noun" that requires an
// external referent is a hard failure.
const DANGLING_REFERENCE_RE = /\b(this|these|it|they)\s+(adverse\s+effect|mechanism|condition|presentation|disease|drug|medication|finding|symptom|patient)\b|\bthis\s+(?:happen|occur|work)\b/i

const QUESTION_STEM_FRONT_RE = /\bwhich (?:of the following|management approach|finding|diagnosis|mechanism|drug|treatment|enzyme|organism)\b|\bwhat is the most (?:likely|appropriate)\b|\bwhat is the best next step\b|\bwhich .* most likely\b|\bwhich .* best explains\b/i

const REPETITIVE_MECHANISM_RE = /\bmechanism explains\b.*\bmechanism\b/i

const META_BACK_RE = /^\s*(?:students?|learners?)\s+(?:pick|choose|confuse|miss|think|assume)\b/i

const TREATMENT_FRONT_RE = /\b(?:how is|how are|what is|what are)\b.*\b(?:treated|treatment|therapy|managed|management|first.?line)\b/i
const TREATMENT_BACK_RE = /\b(?:treat\w*|therapy|manage\w*|management|first.?line|drug|administer|give|use|start|avoid|contraindicat\w*|dose|blocker|blockade|inhibitor|inhibit\w*|antibiotic|surgery|procedure|resuscitation|fluid|ventilation|cardioversion|magnesium|insulin|steroid|nsaid|colchicine|benzodiazepine|labetalol|potentiate\w*|reduce[sd]?)\b/i

const CONTRAINDICATION_FRONT_RE = /\bwhen is\b.*\bcontraindicated\b/i
const CONTRAINDICATION_BACK_RE = /\b(?:contraindicat\w*|avoid\w*|danger\w*|risk\w*|worsen\w*|toxicity|adverse|harm\w*|precipitat\w*|not use|do not use)\b/i

const STOPWORDS = new Set([
  'the', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'without', 'from',
  'by', 'at', 'as', 'is', 'are', 'be', 'being', 'been', 'what', 'which', 'why',
  'how', 'does', 'do', 'did', 'this', 'that', 'these', 'those', 'clinical',
  'mechanism', 'mechanisms', 'explains', 'explain', 'cause', 'causes', 'caused',
  'causing', 'key', 'classic', 'finding', 'findings', 'patient', 'disease',
  'syndrome', 'primary', 'secondary', 'acute', 'chronic',
])

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[α]/g, 'alpha')
    .replace(/[β]/g, 'beta')
    .replace(/[γ]/g, 'gamma')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
}

function hasConceptBackOverlap(card, back) {
  const concept = card.testedConcept || card.concept || ''
  if (!concept) return true
  const conceptTokens = new Set(tokens(concept))
  if (conceptTokens.size === 0) return true
  const backTokens = new Set(tokens(back))
  let hits = 0
  for (const t of conceptTokens) {
    if (backTokens.has(t)) hits += 1
  }
  return hits > 0
}

/**
 * Validates a clinical reinforcement card against educational quality rules.
 *
 * Rejection reasons:
 *   'front_too_short'      — front is blank or fewer than 8 characters
 *   'dangling_reference'   — front contains an unresolved pronoun ("this adverse effect", etc.)
 *   'meta_learning_prompt' — educational-narration front ("what mistake…", "how do you remember…")
 *   'pure_definition'      — "What is X?" with no mechanism/aspect qualifier
 *   'repetitive_prompt'    — front says "mechanism explains ... mechanism"
 *   'meta_trap_answer'     — back starts with "Students pick/confuse..."
 *   'treatment_mismatch'   — treatment front has no treatment/management back
 *   'contraindication_mismatch' — contraindication front has no avoid/risk back
 *   'concept_answer_mismatch' — generated card answer does not overlap tested concept
 *   'back_too_short'       — back has fewer than 2 words
 *   'back_too_sparse'      — back has fewer than 6 words and no mechanism language
 *   'back_buzzword_only'   — back is 1–3 words with no mechanism language
 *
 * @param {{ clinicalPrompt?: string, front?: string, coreMechanism?: string, back?: string }} card
 * @returns {{ valid: boolean, reasons: string[] }}
 */
export function validateClinicalCard(card) {
  const front = ((card.clinicalPrompt ?? card.front) || '').trim()
  const back  = ((card.coreMechanism  ?? card.back)  || '').trim()
  const reasons = []

  // ── Front ──────────────────────────────────────────────────────────
  if (front.length < 8) {
    reasons.push('front_too_short')
  } else if (DANGLING_REFERENCE_RE.test(front)) {
    reasons.push('dangling_reference')
  } else if (META_FRONT_RE.test(front)) {
    reasons.push('meta_learning_prompt')
  } else if (QUESTION_STEM_FRONT_RE.test(front)) {
    reasons.push('copied_question_stem')
  } else if (REPETITIVE_MECHANISM_RE.test(front)) {
    reasons.push('repetitive_prompt')
  } else if (BARE_DEF_RE.test(front) && !ASPECT_RE.test(front)) {
    reasons.push('pure_definition')
  }

  if (TREATMENT_FRONT_RE.test(front) && !TREATMENT_BACK_RE.test(back)) {
    reasons.push('treatment_mismatch')
  }

  if (CONTRAINDICATION_FRONT_RE.test(front) && !CONTRAINDICATION_BACK_RE.test(back)) {
    reasons.push('contraindication_mismatch')
  }

  if (META_BACK_RE.test(back)) {
    reasons.push('meta_trap_answer')
  }

  if (!hasConceptBackOverlap(card, back)) {
    reasons.push('concept_answer_mismatch')
  }

  // ── Back ───────────────────────────────────────────────────────────
  const backWords = back.split(/\s+/).filter(Boolean)
  if (backWords.length < 2) {
    reasons.push('back_too_short')
  } else if (backWords.length < 4 && !MECHANISM_RE.test(back)) {
    reasons.push('back_buzzword_only')
  } else if (backWords.length < 6 && !MECHANISM_RE.test(back)) {
    reasons.push('back_too_sparse')
  }

  return { valid: reasons.length === 0, reasons }
}
