import { describe, it, expect } from 'vitest'
import { validateClinicalCard } from './flashcardValidator.js'

const card = (front, back) => ({ front, back })

describe('validateClinicalCard — accepted cards', () => {
  it('accepts a mechanism-focused clinical cue card', () => {
    const r = validateClinicalCard(card(
      'SSRI started 2 weeks ago → confusion + Na⁺ 118. What mechanism causes this?',
      'SIADH → ↑ ADH/V2 signaling → water retention without sodium wasting.'
    ))
    expect(r.valid).toBe(true)
    expect(r.reasons).toHaveLength(0)
  })

  it('accepts "What is the mechanism of X?" — has aspect qualifier', () => {
    const r = validateClinicalCard(card(
      'What is the mechanism of ACE inhibitor cough?',
      'Bradykinin accumulation from ACE inhibition causes cough reflex.'
    ))
    expect(r.valid).toBe(true)
  })

  it('accepts a treatment prompt with mechanism back', () => {
    const r = validateClinicalCard(card(
      'What is first-line treatment for status epilepticus?',
      'Benzodiazepines potentiate GABA-A receptor Cl⁻ influx to inhibit seizure.'
    ))
    expect(r.valid).toBe(true)
  })

  it('accepts a clinical presentation prompt with causal back', () => {
    const r = validateClinicalCard(card(
      'How does primary hyperaldosteronism present in a hypertensive patient?',
      'Hypokalemia due to aldosterone-driven renal K⁺ wasting via ENaC activation.'
    ))
    expect(r.valid).toBe(true)
  })

  it('accepts a mechanism-based trap card', () => {
    const r = validateClinicalCard(card(
      'What is the mechanism of hyponatremia in SIADH?',
      'Primary issue is excess water retention, not sodium wasting or loss.'
    ))
    expect(r.valid).toBe(true)
  })

  it('accepts a back with → arrow notation', () => {
    const r = validateClinicalCard(card(
      'What is the mechanism of furosemide renal toxicity?',
      'NKCC2 block → ↑ tubular flow → free radical mediated tubular damage.'
    ))
    expect(r.valid).toBe(true)
  })

  it('accepts a pathophysiology prompt', () => {
    const r = validateClinicalCard(card(
      'What is the pathophysiology of nephrotic syndrome proteinuria?',
      'Loss of glomerular podocytes causes basement membrane charge barrier failure.'
    ))
    expect(r.valid).toBe(true)
  })
})

describe('validateClinicalCard — rejected cards', () => {
  it('rejects "What is SIADH?" — pure definition, no aspect qualifier', () => {
    const r = validateClinicalCard(card(
      'What is SIADH?',
      'Syndrome of inappropriate antidiuretic hormone secretion.'
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('pure_definition')
  })

  it('rejects "What is ADH?" — bare definition', () => {
    const r = validateClinicalCard(card(
      'What is ADH?',
      'Antidiuretic hormone from posterior pituitary.'
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('pure_definition')
  })

  it('rejects "Define nephrotic syndrome." — no aspect qualifier', () => {
    const r = validateClinicalCard(card(
      'Define nephrotic syndrome.',
      'Proteinuria greater than 3.5 grams per day.'
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('pure_definition')
  })

  it('rejects meta-learning fronts like "What mistake do students make..."', () => {
    const r = validateClinicalCard(card(
      'What mistake do students make about SIADH?',
      'Primary issue is excess water retention, not sodium wasting.'
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('meta_learning_prompt')
  })

  it('rejects "How do you remember X?" mnemonic prompts', () => {
    const r = validateClinicalCard(card(
      'How do you remember furosemide mechanism?',
      'FURO = Furosemide Urges Renal Output via NKCC2 inhibition.'
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('meta_learning_prompt')
  })

  it('rejects a back that is a single-word buzzword', () => {
    const r = validateClinicalCard(card(
      'What is the side effect of ACE inhibitors?',
      'Bradykinin'
    ))
    expect(r.valid).toBe(false)
    // Single word triggers back_too_short (< 2 words); multi-word no-mechanism triggers back_buzzword_only
    const isBackRejected = r.reasons.includes('back_too_short') || r.reasons.includes('back_buzzword_only')
    expect(isBackRejected).toBe(true)
  })

  it('rejects a 2-word back with no mechanism language', () => {
    const r = validateClinicalCard(card(
      'What is the side effect of ACE inhibitors?',
      'Dry cough'
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('back_buzzword_only')
  })

  it('rejects a front that is too short', () => {
    const r = validateClinicalCard(card('X?', 'Something valid and mechanistic.'))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('front_too_short')
  })

  it('rejects an empty back', () => {
    const r = validateClinicalCard(card(
      'What is the mechanism of renal potassium wasting?',
      ''
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('back_too_short')
  })
})

describe('validateClinicalCard — dangling reference (unresolved pronoun)', () => {
  it('rejects "What is the mechanism of this adverse effect?" — unresolved "this"', () => {
    const r = validateClinicalCard(card(
      'What is the mechanism of this adverse effect?',
      'Bradykinin accumulation causes cough reflex via ACE inhibition.'
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('dangling_reference')
  })

  it('rejects "What causes this condition?" — no explicit entity', () => {
    const r = validateClinicalCard(card(
      'What causes this condition?',
      'Aldosterone excess drives sodium retention and hypokalemia.'
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('dangling_reference')
  })

  it('rejects "What is the treatment for this disease?" — dangling disease reference', () => {
    const r = validateClinicalCard(card(
      'What is the treatment for this disease?',
      'Loop diuretics reduce preload through NKCC2 inhibition.'
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('dangling_reference')
  })

  it('rejects "What explains this presentation?" — dangling presentation reference', () => {
    const r = validateClinicalCard(card(
      'What explains this presentation?',
      'Excess aldosterone leads to sodium retention and potassium loss.'
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('dangling_reference')
  })

  it('rejects "Why does this happen?" — unresolved pronoun with no entity', () => {
    const r = validateClinicalCard(card(
      'Why does this happen?',
      'ADH excess causes water retention without sodium loss.'
    ))
    expect(r.valid).toBe(false)
    expect(r.reasons).toContain('dangling_reference')
  })

  it('accepts "What causes ACE inhibitor cough?" — explicit entity', () => {
    const r = validateClinicalCard(card(
      'What causes ACE inhibitor cough?',
      'Bradykinin accumulation from ACE inhibition triggers the cough reflex.'
    ))
    expect(r.valid).toBe(true)
    expect(r.reasons).toHaveLength(0)
  })

  it('accepts "What mechanism causes SIADH hyponatremia?" — explicit entity', () => {
    const r = validateClinicalCard(card(
      'What mechanism causes SIADH hyponatremia?',
      'ADH excess → water retention without sodium loss → dilutional hyponatremia.'
    ))
    expect(r.valid).toBe(true)
    expect(r.reasons).toHaveLength(0)
  })

  it('accepts "Why does spironolactone cause hyperkalemia?" — explicit drug + effect', () => {
    const r = validateClinicalCard(card(
      'Why does spironolactone cause hyperkalemia?',
      'Aldosterone receptor block → reduced principal-cell K⁺ secretion → K⁺ retention.'
    ))
    expect(r.valid).toBe(true)
    expect(r.reasons).toHaveLength(0)
  })

  it('accepts "What causes metformin-associated lactic acidosis?" — explicit entity', () => {
    const r = validateClinicalCard(card(
      'What causes metformin-associated lactic acidosis?',
      'Metformin inhibits complex I → impairs oxidative phosphorylation → lactate accumulates.'
    ))
    expect(r.valid).toBe(true)
    expect(r.reasons).toHaveLength(0)
  })
})

describe('validateClinicalCard — backward compatibility', () => {
  it('reads clinicalPrompt and coreMechanism when present', () => {
    const r = validateClinicalCard({
      clinicalPrompt: 'What is the side effect of valproate in pregnancy?',
      coreMechanism:  'Neural tube closure failure from impaired folate-dependent development.'
    })
    expect(r.valid).toBe(true)
  })

  it('prefers clinicalPrompt over front when both provided', () => {
    const r = validateClinicalCard({
      clinicalPrompt: 'What is the mechanism of renal potassium wasting?',
      front:          'What is potassium?',
      coreMechanism:  'Aldosterone → principal cell ENaC activation → K⁺ secretion into tubule.',
      back:           'K',
    })
    expect(r.valid).toBe(true)
  })

  it('falls back to front/back when clinicalPrompt/coreMechanism absent', () => {
    const r = validateClinicalCard({
      front: 'What is the treatment of hypertensive emergency?',
      back:  'IV labetalol reduces BP through alpha and beta blockade.'
    })
    expect(r.valid).toBe(true)
  })
})
