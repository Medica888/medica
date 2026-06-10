import { normalizeSubject, normalizeSystem } from '../medicaTaxonomy.js';
import { getPairStatus } from '../medicaUsmleMatrix.js';
import type { ValidationQuestion, ValidatorResult } from './validationTypes.js';

// ── Content-detection regexes (Cardiovascular + Renal) ───────────────────────
// These four combinations have content-level detection in addition to pair-level
// matrix gating. New combinations will be added here in future validator phases.

const CARDIO_PATHOLOGY_RE = /\b(myocardial\s+infarct|mi\b|atherosclerosis|atheroma|foam\s+cell|fibrous\s+cap|vasculitis|polyarteritis|takayasu|giant\s+cell|kawasaki|buerger|rheumatic\s+heart|aschoff|anitschkow|vegetation|coagulative\s+necrosis|fibrinoid\s+necrosis|cystic\s+medial|aortic\s+dissection|histolog|biopsy|patholog)\b/i;
const CARDIO_PHARM_RE = /\b(beta\s*blocker|ace\s*inhibitor|angiotensin|arb\b|antiarrhythmic|calcium\s+channel|amlodipine|verapamil|diltiazem|statin|nitrate|digoxin|diuretic|antihypertensive|pharmacolog|drug|medication|mechanism\s+of\s+action)\b/i;
const RENAL_PHYS_RE = /\b(acid.?base|bicarbonate|hco3|respiratory\s+(acidosis|alkalosis)|metabolic\s+(acidosis|alkalosis)|compensation|gfr|glomerular\s+filtration|clearance|filtration\s+fraction|transporter|countercurrent|loop\s+of\s+henle|collecting\s+duct|na\+?|potassium|aldosterone|adh|osmolar|osmotic|renal\s+physiology)\b/i;
const RENAL_PATH_RE = /\b(glomerulonephritis|nephritic|nephrotic|minimal\s+change|fsgs|membranous|membranoproliferative|iga\s+nephropathy|rpg?n|crescent|renal\s+cell\s+carcinoma|acute\s+tubular\s+necrosis|polycystic|patholog|biopsy|histolog)\b/i;

function textFor(q: ValidationQuestion): string {
  const options = (q.options || []).map(o => o.text).join(' ');
  return [
    q.subject,
    q.system,
    q.topic,
    q.testedConcept,
    q.questionAngle,
    q.usmleContentArea,
    q.physicianTask,
    q.stem,
    options,
    q.explanation,
  ].filter(Boolean).join(' ');
}

export function validateSubjectSystem(question: ValidationQuestion): ValidatorResult {
  const subject = normalizeSubject(question.subject);
  const system = normalizeSystem(question.system);

  if (!subject || !system) {
    return {
      name: 'subject_system',
      status: 'warn',
      blocking: false,
      score: 70,
      expected: [subject || '', system || ''].filter(Boolean).join(' + '),
      detected: '',
      confidence: 0.4,
      reasons: ['subject_system_not_fully_declared'],
    };
  }

  // ── Phase 1: matrix-level gate ────────────────────────────────────────────
  // Invalid combinations are blocked immediately — content detection is skipped.
  const pairStatus = getPairStatus(subject, system);

  if (pairStatus === 'invalid') {
    return {
      name: 'subject_system',
      status: 'fail',
      blocking: true,
      score: 0,
      expected: `${subject} + ${system}`,
      detected: 'invalid_combination',
      confidence: 1,
      reasons: ['invalid_subject_system_combination'],
    };
  }

  // ── Phase 2: content-level detection (cardiovascular + renal) ────────────
  // These checks run for allowed pairs only; they remain unchanged from v1.
  const haystack = textFor(question);

  if (subject === 'Pathology' && system === 'Cardiovascular') {
    if (CARDIO_PHARM_RE.test(haystack) && !CARDIO_PATHOLOGY_RE.test(haystack)) {
      return {
        name: 'subject_system',
        status: 'fail',
        blocking: true,
        score: 0,
        expected: 'Pathology + Cardiovascular',
        detected: 'cardiovascular_pharmacology',
        confidence: 0.9,
        reasons: ['cardio_pharmacology_not_pathology'],
      };
    }
    if (CARDIO_PATHOLOGY_RE.test(haystack)) {
      return {
        name: 'subject_system',
        status: 'pass',
        blocking: false,
        score: 100,
        expected: 'Pathology + Cardiovascular',
        detected: 'cardiovascular_pathology',
        confidence: 0.9,
        reasons: [],
      };
    }
    return {
      name: 'subject_system',
      status: 'warn',
      blocking: false,
      score: 75,
      expected: 'Pathology + Cardiovascular',
      detected: 'uncertain_cardio_pathology',
      confidence: 0.5,
      reasons: ['cardio_pathology_signal_weak'],
    };
  }

  if (subject === 'Pharmacology' && system === 'Cardiovascular') {
    if (CARDIO_PATHOLOGY_RE.test(haystack) && !CARDIO_PHARM_RE.test(haystack)) {
      return {
        name: 'subject_system',
        status: 'fail',
        blocking: true,
        score: 0,
        expected: 'Pharmacology + Cardiovascular',
        detected: 'cardiovascular_pathology',
        confidence: 0.9,
        reasons: ['cardio_pathology_not_pharmacology'],
      };
    }
    if (CARDIO_PHARM_RE.test(haystack)) {
      return {
        name: 'subject_system',
        status: 'pass',
        blocking: false,
        score: 100,
        expected: 'Pharmacology + Cardiovascular',
        detected: 'cardiovascular_pharmacology',
        confidence: 0.9,
        reasons: [],
      };
    }
    return {
      name: 'subject_system',
      status: 'warn',
      blocking: false,
      score: 75,
      expected: 'Pharmacology + Cardiovascular',
      detected: 'uncertain_cardio_pharmacology',
      confidence: 0.5,
      reasons: ['cardio_pharmacology_signal_weak'],
    };
  }

  if (subject === 'Physiology' && system === 'Renal / Urinary') {
    if (RENAL_PATH_RE.test(haystack)) {
      return {
        name: 'subject_system',
        status: 'fail',
        blocking: true,
        score: 0,
        expected: 'Physiology + Renal / Urinary',
        detected: 'renal_pathology',
        confidence: 0.9,
        reasons: ['renal_pathology_not_physiology'],
      };
    }
    if (RENAL_PHYS_RE.test(haystack)) {
      return {
        name: 'subject_system',
        status: 'pass',
        blocking: false,
        score: 100,
        expected: 'Physiology + Renal / Urinary',
        detected: 'renal_physiology',
        confidence: 0.9,
        reasons: [],
      };
    }
    return {
      name: 'subject_system',
      status: 'warn',
      blocking: false,
      score: 75,
      expected: 'Physiology + Renal / Urinary',
      detected: 'uncertain_renal_physiology',
      confidence: 0.5,
      reasons: ['renal_physiology_signal_weak'],
    };
  }

  if (subject === 'Pathology' && system === 'Renal / Urinary') {
    if (RENAL_PHYS_RE.test(haystack) && !RENAL_PATH_RE.test(haystack)) {
      return {
        name: 'subject_system',
        status: 'fail',
        blocking: true,
        score: 0,
        expected: 'Pathology + Renal / Urinary',
        detected: 'renal_physiology',
        confidence: 0.85,
        reasons: ['renal_physiology_not_pathology'],
      };
    }
    return {
      name: 'subject_system',
      status: RENAL_PATH_RE.test(haystack) ? 'pass' : 'warn',
      blocking: false,
      score: RENAL_PATH_RE.test(haystack) ? 100 : 75,
      expected: 'Pathology + Renal / Urinary',
      detected: RENAL_PATH_RE.test(haystack) ? 'renal_pathology' : 'uncertain_renal_pathology',
      confidence: RENAL_PATH_RE.test(haystack) ? 0.9 : 0.5,
      reasons: RENAL_PATH_RE.test(haystack) ? [] : ['renal_pathology_signal_weak'],
    };
  }

  // ── Phase 3: matrix-based fallback for all other pairs ────────────────────
  // Content detection will be added per-pair in subsequent validator phases.
  // For now: allowed → pass at 0.7 confidence; warning → non-blocking warn.

  if (pairStatus === 'warning') {
    return {
      name: 'subject_system',
      status: 'warn',
      blocking: false,
      score: 60,
      expected: `${subject} + ${system}`,
      detected: 'low_yield_combination',
      confidence: 0.5,
      reasons: ['low_yield_subject_system_combination'],
    };
  }

  // pairStatus === 'allowed' (or 'unknown' as safe fallback)
  return {
    name: 'subject_system',
    status: 'pass',
    blocking: false,
    score: 100,
    expected: `${subject} + ${system}`,
    detected: `${subject} + ${system}`,
    confidence: 0.7,
    reasons: [],
  };
}
