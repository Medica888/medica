// Question Quality Registry — governs which questions are active in runtime sessions.
// Quarantined questions stay in QUESTION_BANK for structural tests but are excluded
// from session generation by _buildMockPool.

// ── Template clone IDs ────────────────────────────────────────────────────────
// 67 balanced "46-year-old USMLE teaching session" template clones.
const BALANCED_CLONE_IDS = [
  'qB001','qB002','qB003','qB004','qB005','qB006','qB007','qB008','qB009','qB010',
  'qB011','qB012','qB013','qB014','qB015','qB016','qB017','qB018','qB019','qB020',
  'qB021','qB022','qB023','qB024','qB025','qB026','qB027','qB028','qB029','qB030',
  'qB031','qB032','qB033','qB034','qB036','qB037','qB038','qB039','qB040','qB041',
  'qB042','qB043','qB044','qB045','qB046','qB047','qB048','qB049','qB050','qB051',
  'qB052','qB053','qB054','qB055','qB056','qB057','qB058','qB059','qB060','qB061',
  'qB062','qB063','qB064','qB065','qB066','qB067','qB068',
]

// 40 NBME-Difficult clones with generic distractor family
// ("nonspecific stress response / autoimmune destruction / medication toxicity").
const NBME_CLONE_IDS = [
  'qNB041','qNB042','qNB043','qNB044','qNB045','qNB046','qNB047','qNB048','qNB049','qNB050',
  'qNB051','qNB052','qNB053','qNB054','qNB055','qNB056','qNB057','qNB058','qNB059','qNB060',
  'qNB061','qNB062','qNB063','qNB064','qNB065','qNB066','qNB067','qNB068','qNB069','qNB070',
  'qNB071','qNB072','qNB073','qNB074','qNB075','qNB076','qNB077','qNB078','qNB079','qNB080',
]

export const QUARANTINED_IDS = new Set([...BALANCED_CLONE_IDS, ...NBME_CLONE_IDS])

/** Returns true when the question is quarantined and must not appear in sessions. */
export function isQuarantined(id) {
  return QUARANTINED_IDS.has(id)
}

// ── Quality metadata ──────────────────────────────────────────────────────────
// Per-question metadata for governance, medical review, and tracking.
// Keys are question IDs; only questions with non-trivial metadata are listed.

export const QUALITY_REGISTRY = {
  // ── Verified fixes ─────────────────────────────────────────────────────────
  q012: {
    status: 'fixed',
    qualityFlags: ['clinical_contradiction_stem_vs_explanation', 'nucleus_vs_fascicle_localization'],
    sourceRefs: ['Ventral caudal pontine localization — ipsilateral CN VI/VII fascicles with contralateral corticospinal findings'],
    contentVersion: 3,
    lastReviewedAt: '2026-06-27',
    reviewerNotes: 'Corrected facial laterality and changed the eye finding from an abducens nucleus lesion to an abducens fascicle lesion; an abducens nucleus lesion would impair conjugate gaze.',
  },

  // ── Needs medical review ───────────────────────────────────────────────────
  q021: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['terminology_precision'],
    reviewerNotes: 'Rewritten to use Cockcroft-Gault creatinine clearance and test relative renal elimination without falsely calling CrCl 32 mL/min a contraindication.',
    sourceRefs: ['Pradaxa US prescribing information (2025) — NVAF dosing uses CrCl thresholds'],
    lastReviewedAt: '2026-06-27',
  },
  q086: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['clinical_accuracy'],
    reviewerNotes: 'Removed inappropriate dexamethasone suppression testing from an obvious exogenous glucocorticoid scenario; now tests HPA-axis suppression directly.',
    lastReviewedAt: '2026-06-27',
  },
  q090: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['guideline_currency'],
    reviewerNotes: 'Replaced empiric clarithromycin triple therapy with optimized bismuth quadruple therapy and retained universal test-of-cure teaching.',
    sourceRefs: ['ACG Clinical Guideline: Treatment of H. pylori Infection (2024)'],
    lastReviewedAt: '2026-06-27',
  },
  q023: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['incorrect_anatomic_localization'],
    reviewerNotes: 'Rewritten as posterior interosseous neuropathy with finger drop, preserved sensation, and wrist extension with radial deviation.',
    lastReviewedAt: '2026-06-27',
  },
  q001: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['anatomic_internal_consistency'],
    reviewerNotes: 'Imaging now explicitly shows the dissection flap compromising the left subclavian origin rather than beginning strictly distal to it.',
    lastReviewedAt: '2026-06-27',
  },
  q080: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['outdated_epidemiologic_claim'],
    reviewerNotes: 'Removed the false statement that ALL is the leading cause of childhood cancer death while preserving that it is the most common childhood cancer.',
    lastReviewedAt: '2026-06-27',
  },

  // ── Quarantined clone batches (summary entries) ────────────────────────────
  q014: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['ambiguous_lead_in'],
    reviewerNotes: 'Narrowed the lead-in to bloodstream survival through resistance to opsonization and phagocytosis, removing capsule-versus-endotoxin ambiguity.',
    lastReviewedAt: '2026-06-27',
  },
  q032: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['guideline_currency'],
    sourceRefs: ['GINA Strategy Report (2025) - preferred adult Step 3 treatment uses low-dose ICS-formoterol MART'],
    reviewerNotes: 'Updated the preferred adult asthma step-up answer to maintenance-and-reliever therapy with low-dose ICS-formoterol.',
    lastReviewedAt: '2026-06-27',
  },
  q073: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['ambiguous_lead_in'],
    reviewerNotes: 'Rewritten to test the appreciation and reasoning elements of decision-making capacity instead of asking for a disputed missing consent element.',
    lastReviewedAt: '2026-06-27',
  },
  q075: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['outdated_diagnostic_criterion', 'guideline_currency'],
    reviewerNotes: 'Removed LH/FSH ratio and obsolete follicle-count language as diagnostic requirements; retained exclusion of common mimics and current fertility treatment teaching.',
    lastReviewedAt: '2026-06-27',
  },
  q095: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['overstated_epidemiologic_claim'],
    reviewerNotes: 'Removed unsupported sudden-death superlatives and corrected the relationship between aortic stenosis and hypertrophic cardiomyopathy.',
    lastReviewedAt: '2026-06-27',
  },
  q096: {
    status: 'fixed',
    reviewStatus: 'reviewed',
    qualityFlags: ['management_nuance'],
    reviewerNotes: 'Clarified that beta blockers should not be newly initiated or up-titrated during active decompensation, while chronic therapy may be continued when perfusion is adequate and shock is absent.',
    lastReviewedAt: '2026-06-27',
  },
  q043: {
    status: 'improved',
    reviewStatus: 'reviewed',
    qualityFlags: ['insufficient_reasoning_depth'],
    reviewerNotes: 'Added placental vascular evidence and made the learner connect abnormal spiral-artery remodeling to antiangiogenic maternal endothelial injury.',
    lastReviewedAt: '2026-06-27',
  },
  qUW001: {
    status: 'improved',
    reviewStatus: 'reviewed',
    qualityFlags: ['insufficient_reasoning_depth'],
    reviewerNotes: 'Added severe kidney injury and normal hepatic function so anticoagulant selection requires integrating HIT treatment with drug clearance.',
    lastReviewedAt: '2026-06-27',
  },
  qUW028: {
    status: 'improved',
    reviewStatus: 'reviewed',
    qualityFlags: ['insufficient_reasoning_depth'],
    reviewerNotes: 'Added intermittent-to-persistent pain and discordant venous/arterial Doppler findings to test torsion physiology rather than simple recognition.',
    lastReviewedAt: '2026-06-27',
  },
  qUW032: {
    status: 'improved',
    reviewStatus: 'reviewed',
    qualityFlags: ['insufficient_reasoning_depth'],
    reviewerNotes: 'Changed a monitoring-recall item into immediate management of febrile severe neutropenia during clozapine therapy.',
    lastReviewedAt: '2026-06-27',
  },

  _balanced_clone_batch: {
    status: 'quarantined',
    affectedIds: BALANCED_CLONE_IDS,
    qualityFlags: ['template_clone', 'teaching_session_stem', 'generic_distractors'],
    reviewerNotes: '67 questions use "A 46-year-old patient is evaluated during a USMLE-style teaching session" template with three generic wrong-answer options. Students see correct concept as option A before shuffling; distractors are non-clinical placeholders.',
    requiredAction: 'Replace with proper USMLE-style clinical vignettes before restoring to active pool.',
    lastReviewedAt: '2026-06-27',
  },
  _nbme_clone_batch: {
    status: 'quarantined',
    affectedIds: NBME_CLONE_IDS,
    qualityFlags: ['template_clone', 'generic_distractors'],
    reviewerNotes: '40 NBME Difficult questions share the same three generic distractor options: "nonspecific stress response unrelated to the defining findings", "Autoimmune destruction of the target organ", "Medication toxicity that is not supported by the timing or history". Stems are real clinical vignettes but distractors are non-specific filler.',
    requiredAction: 'Replace generic distractors with clinically specific alternatives before restoring to active pool.',
    lastReviewedAt: '2026-06-27',
  },
}

// ── Template clone detection ──────────────────────────────────────────────────

const BALANCED_TEMPLATE_SIGNAL = 'USMLE-style teaching session'

const NBME_GENERIC_DISTRACTORS = [
  'nonspecific stress response',
  'Autoimmune destruction of the target organ',
  'Medication toxicity that is not supported',
]

/**
 * Detects template clone families in a question array.
 * Returns { balancedClones: string[], nbmeClones: string[], totalClones: number }.
 */
export function detectTemplateClonesInBank(questions) {
  const balancedClones = questions
    .filter(q => typeof q.stem === 'string' && q.stem.includes(BALANCED_TEMPLATE_SIGNAL))
    .map(q => q.id)

  const nbmeClones = questions
    .filter(q => {
      const optTexts = (q.options || []).map(o => o.text || '')
      const genericCount = NBME_GENERIC_DISTRACTORS.filter(d => optTexts.some(t => t.includes(d))).length
      return genericCount >= 2
    })
    .map(q => q.id)

  return {
    balancedClones,
    nbmeClones,
    totalClones: new Set([...balancedClones, ...nbmeClones]).size,
  }
}
