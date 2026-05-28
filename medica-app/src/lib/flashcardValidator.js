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

/**
 * Validates a clinical reinforcement card against educational quality rules.
 *
 * Rejection reasons:
 *   'front_too_short'     — front is blank or fewer than 8 characters
 *   'pure_definition'     — "What is X?" with no mechanism/aspect qualifier
 *   'back_too_short'      — back has fewer than 2 words
 *   'back_buzzword_only'  — back is 1–3 words with no mechanism language
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
  } else if (META_FRONT_RE.test(front)) {
    reasons.push('meta_learning_prompt')
  } else if (BARE_DEF_RE.test(front) && !ASPECT_RE.test(front)) {
    reasons.push('pure_definition')
  }

  // ── Back ───────────────────────────────────────────────────────────
  const backWords = back.split(/\s+/).filter(Boolean)
  if (backWords.length < 2) {
    reasons.push('back_too_short')
  } else if (backWords.length < 4 && !MECHANISM_RE.test(back)) {
    reasons.push('back_buzzword_only')
  }

  return { valid: reasons.length === 0, reasons }
}
