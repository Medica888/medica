/**
 * Subject×System Validator Tests
 *
 * Verifies the two-phase validation architecture:
 *   Phase 1 — matrix-level gate (invalid pairs blocked, warning pairs warned)
 *   Phase 2 — content-level detection for the 4 existing combos (unchanged)
 *
 * Also verifies the specific pairs called out in the v7.0.0 matrix spec:
 *   Biostatistics + Cardiovascular → block
 *   Ethics + Neurology             → block
 *   Behavioral Science + Renal     → block
 *   Biochemistry + Cardiovascular  → warn, non-blocking
 *   Genetics + Cardiovascular      → warn, non-blocking
 *   Pharmacology + Neurology       → pass
 */

import { describe, it, expect } from 'vitest';
import { validateSubjectSystem } from './subjectSystemValidator.js';
import type { ValidationQuestion } from './validationTypes.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function q(
  subject: string,
  system: string,
  extra: Partial<ValidationQuestion> = {},
): ValidationQuestion {
  return { subject, system, ...extra };
}

// Stem that fires CARDIO_PATHOLOGY_RE (atherosclerosis, biopsy, histolog, etc.)
const CARDIO_PATH_STEM =
  'A 62-year-old man dies suddenly. Autopsy reveals an atherosclerotic plaque with foam cells and a fibrous cap. Histologic biopsy of the coronary artery shows coagulative necrosis. What pathologic process is demonstrated?';

// Stem that fires CARDIO_PHARM_RE (ACE inhibitor, beta blocker, etc.) but NOT CARDIO_PATHOLOGY_RE
const CARDIO_PHARM_STEM =
  'A 55-year-old woman with hypertension is started on an ACE inhibitor. She develops a dry nonproductive cough. What is the mechanism of this adverse effect of this antihypertensive medication?';

// Stem that fires RENAL_PATH_RE (glomerulonephritis, nephrotic, biopsy, etc.)
const RENAL_PATH_STEM =
  'A 7-year-old presents with periorbital edema. Renal biopsy shows minimal change glomerulonephritis with nephrotic-range proteinuria. What is the histologic finding?';

// Stem that fires RENAL_PHYS_RE (GFR, acid-base, bicarbonate, etc.) but NOT RENAL_PATH_RE
const RENAL_PHYS_STEM =
  'A 45-year-old develops a metabolic acidosis. Serum HCO3 is 12 mEq/L. The glomerular filtration rate remains normal. Compensation via respiratory alkalosis is observed. What is the primary renal mechanism?';

// Generic stem with no domain-specific signal
const GENERIC_STEM = 'A 40-year-old patient presents with fatigue. Which of the following is most likely?';

// ── Phase 1: Matrix-level gate — invalid pairs ────────────────────────────────

describe('matrix gate — invalid pairs are blocked', () => {
  // User-specified cases
  it('Biostatistics + Cardiovascular → fail, blocking', () => {
    const r = validateSubjectSystem(q('Biostatistics', 'Cardiovascular'));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
    expect(r.reasons).toContain('invalid_subject_system_combination');
  });

  it('Ethics + Neurology → fail, blocking', () => {
    const r = validateSubjectSystem(q('Ethics', 'Neurology'));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
    expect(r.reasons).toContain('invalid_subject_system_combination');
  });

  it('Behavioral Science + Renal / Urinary → fail, blocking', () => {
    const r = validateSubjectSystem(q('Behavioral Science', 'Renal / Urinary'));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
    expect(r.reasons).toContain('invalid_subject_system_combination');
  });

  // Additional invalid pairs covering all three invalid subject categories
  it('Microbiology + Psychiatry → fail, blocking', () => {
    const r = validateSubjectSystem(q('Microbiology', 'Psychiatry'));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
  });

  it('Immunology + Psychiatry → fail, blocking', () => {
    const r = validateSubjectSystem(q('Immunology', 'Psychiatry'));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
  });

  it('Behavioral Science + Cardiovascular → fail, blocking', () => {
    const r = validateSubjectSystem(q('Behavioral Science', 'Cardiovascular'));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
  });

  it('Behavioral Science + Hematology → fail, blocking', () => {
    const r = validateSubjectSystem(q('Behavioral Science', 'Hematology'));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
  });

  it('Biostatistics + Respiratory → fail, blocking', () => {
    const r = validateSubjectSystem(q('Biostatistics', 'Respiratory'));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
  });

  it('Biostatistics + Psychiatry → fail, blocking', () => {
    const r = validateSubjectSystem(q('Biostatistics', 'Psychiatry'));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
  });

  it('Ethics + Cardiovascular → fail, blocking', () => {
    const r = validateSubjectSystem(q('Ethics', 'Cardiovascular'));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
  });

  it('Ethics + Hematology → fail, blocking', () => {
    const r = validateSubjectSystem(q('Ethics', 'Hematology'));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
  });

  it('score is 0 for all blocked pairs', () => {
    const pairs = [
      ['Biostatistics', 'Cardiovascular'],
      ['Ethics', 'Neurology'],
      ['Behavioral Science', 'Renal / Urinary'],
    ] as const;
    for (const [subject, system] of pairs) {
      expect(validateSubjectSystem(q(subject, system)).score).toBe(0);
    }
  });
});

// ── Phase 1: Matrix-level gate — warning pairs ────────────────────────────────

describe('matrix gate — warning pairs warn but do not block', () => {
  // User-specified cases
  it('Biochemistry + Cardiovascular → warn, non-blocking', () => {
    const r = validateSubjectSystem(q('Biochemistry', 'Cardiovascular'));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
    expect(r.reasons).toContain('low_yield_subject_system_combination');
  });

  it('Genetics + Cardiovascular → warn, non-blocking', () => {
    const r = validateSubjectSystem(q('Genetics', 'Cardiovascular'));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
    expect(r.reasons).toContain('low_yield_subject_system_combination');
  });

  // Additional warning pairs
  it('Biochemistry + Musculoskeletal → warn, non-blocking', () => {
    const r = validateSubjectSystem(q('Biochemistry', 'Musculoskeletal'));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
  });

  it('Genetics + Endocrine → warn, non-blocking', () => {
    const r = validateSubjectSystem(q('Genetics', 'Endocrine'));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
  });

  it('Genetics + Psychiatry → warn, non-blocking', () => {
    const r = validateSubjectSystem(q('Genetics', 'Psychiatry'));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
  });

  it('Physiology + Psychiatry → warn, non-blocking', () => {
    const r = validateSubjectSystem(q('Physiology', 'Psychiatry'));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
  });

  it('Physiology + Oncology → warn, non-blocking', () => {
    const r = validateSubjectSystem(q('Physiology', 'Oncology'));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
  });

  it('Anatomy + Psychiatry → warn, non-blocking', () => {
    const r = validateSubjectSystem(q('Anatomy', 'Psychiatry'));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
  });

  it('Pathology + Psychiatry → warn, non-blocking', () => {
    const r = validateSubjectSystem(q('Pathology', 'Psychiatry'));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
  });

  it('Immunology + Cardiovascular → warn, non-blocking', () => {
    const r = validateSubjectSystem(q('Immunology', 'Cardiovascular'));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
  });

  it('Behavioral Science + Neurology → warn, non-blocking', () => {
    const r = validateSubjectSystem(q('Behavioral Science', 'Neurology'));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
  });

  it('warning score is < 100 (currently 60)', () => {
    const r = validateSubjectSystem(q('Biochemistry', 'Cardiovascular'));
    expect(r.score).toBeLessThan(100);
    expect(r.score).toBeGreaterThan(0);
  });
});

// ── Phase 1: Matrix-level gate — allowed pairs pass ───────────────────────────

describe('matrix gate — allowed pairs pass (without content detection)', () => {
  // User-specified case
  it('Pharmacology + Neurology → pass', () => {
    const r = validateSubjectSystem(q('Pharmacology', 'Neurology', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  // Representative sample across all subjects
  it('Pharmacology + Renal / Urinary → pass', () => {
    const r = validateSubjectSystem(q('Pharmacology', 'Renal / Urinary', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Microbiology + Respiratory → pass', () => {
    const r = validateSubjectSystem(q('Microbiology', 'Respiratory', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Microbiology + Gastrointestinal → pass', () => {
    const r = validateSubjectSystem(q('Microbiology', 'Gastrointestinal', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Microbiology + Neurology → pass', () => {
    const r = validateSubjectSystem(q('Microbiology', 'Neurology', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Genetics + Hematology → pass', () => {
    const r = validateSubjectSystem(q('Genetics', 'Hematology', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Genetics + Respiratory (CF) → pass', () => {
    const r = validateSubjectSystem(q('Genetics', 'Respiratory', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Biochemistry + Multisystem → pass', () => {
    const r = validateSubjectSystem(q('Biochemistry', 'Multisystem', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Biochemistry + Hematology → pass', () => {
    const r = validateSubjectSystem(q('Biochemistry', 'Hematology', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Immunology + Renal / Urinary → pass', () => {
    const r = validateSubjectSystem(q('Immunology', 'Renal / Urinary', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Immunology + Multisystem → pass', () => {
    const r = validateSubjectSystem(q('Immunology', 'Multisystem', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Pharmacology + Oncology → pass', () => {
    const r = validateSubjectSystem(q('Pharmacology', 'Oncology', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Pharmacology + Infectious Disease → pass', () => {
    const r = validateSubjectSystem(q('Pharmacology', 'Infectious Disease', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Pharmacology + Endocrine → pass', () => {
    const r = validateSubjectSystem(q('Pharmacology', 'Endocrine', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Pharmacology + Respiratory → pass', () => {
    const r = validateSubjectSystem(q('Pharmacology', 'Respiratory', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Pathology + Neurology → pass', () => {
    const r = validateSubjectSystem(q('Pathology', 'Neurology', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Physiology + Endocrine → pass', () => {
    const r = validateSubjectSystem(q('Physiology', 'Endocrine', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Behavioral Science + Psychiatry → pass', () => {
    const r = validateSubjectSystem(q('Behavioral Science', 'Psychiatry', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Biostatistics + Multisystem → pass', () => {
    const r = validateSubjectSystem(q('Biostatistics', 'Multisystem', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });

  it('Ethics + Multisystem → pass', () => {
    const r = validateSubjectSystem(q('Ethics', 'Multisystem', { stem: GENERIC_STEM }));
    expect(r.status).toBe('pass');
    expect(r.blocking).toBe(false);
  });
});

// ── Phase 2: Existing content-detection branches (unchanged) ─────────────────

describe('content detection — Pathology + Cardiovascular (branch 1)', () => {
  it('passes with cardiovascular pathology content (atherosclerosis, biopsy)', () => {
    const r = validateSubjectSystem(q('Pathology', 'Cardiovascular', { stem: CARDIO_PATH_STEM }));
    expect(r.status).toBe('pass');
    expect(r.detected).toBe('cardiovascular_pathology');
  });

  it('fails when pharmacology content detected without pathology signal', () => {
    const r = validateSubjectSystem(q('Pathology', 'Cardiovascular', { stem: CARDIO_PHARM_STEM }));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
    expect(r.reasons).toContain('cardio_pharmacology_not_pathology');
  });

  it('warns when neither pathology nor pharmacology signal detected', () => {
    const r = validateSubjectSystem(q('Pathology', 'Cardiovascular', { stem: GENERIC_STEM }));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
    expect(r.reasons).toContain('cardio_pathology_signal_weak');
  });
});

describe('content detection — Pharmacology + Cardiovascular (branch 2)', () => {
  it('passes with cardiovascular pharmacology content (ACE inhibitor, medication)', () => {
    const r = validateSubjectSystem(q('Pharmacology', 'Cardiovascular', { stem: CARDIO_PHARM_STEM }));
    expect(r.status).toBe('pass');
    expect(r.detected).toBe('cardiovascular_pharmacology');
  });

  it('fails when pathology content detected without pharmacology signal', () => {
    const r = validateSubjectSystem(q('Pharmacology', 'Cardiovascular', { stem: CARDIO_PATH_STEM }));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
    expect(r.reasons).toContain('cardio_pathology_not_pharmacology');
  });

  it('warns when neither pharmacology nor pathology signal detected', () => {
    const r = validateSubjectSystem(q('Pharmacology', 'Cardiovascular', { stem: GENERIC_STEM }));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
    expect(r.reasons).toContain('cardio_pharmacology_signal_weak');
  });
});

describe('content detection — Physiology + Renal / Urinary (branch 3)', () => {
  it('passes with renal physiology content (GFR, acid-base, HCO3)', () => {
    const r = validateSubjectSystem(q('Physiology', 'Renal / Urinary', { stem: RENAL_PHYS_STEM }));
    expect(r.status).toBe('pass');
    expect(r.detected).toBe('renal_physiology');
  });

  it('fails when renal pathology content detected (glomerulonephritis, biopsy)', () => {
    const r = validateSubjectSystem(q('Physiology', 'Renal / Urinary', { stem: RENAL_PATH_STEM }));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
    expect(r.reasons).toContain('renal_pathology_not_physiology');
  });

  it('warns when physiology signal is absent', () => {
    const r = validateSubjectSystem(q('Physiology', 'Renal / Urinary', { stem: GENERIC_STEM }));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
    expect(r.reasons).toContain('renal_physiology_signal_weak');
  });
});

describe('content detection — Pathology + Renal / Urinary (branch 4)', () => {
  it('passes with renal pathology content (glomerulonephritis, minimal change)', () => {
    const r = validateSubjectSystem(q('Pathology', 'Renal / Urinary', { stem: RENAL_PATH_STEM }));
    expect(r.status).toBe('pass');
    expect(r.detected).toBe('renal_pathology');
  });

  it('fails when only renal physiology content detected without pathology signal', () => {
    const r = validateSubjectSystem(q('Pathology', 'Renal / Urinary', { stem: RENAL_PHYS_STEM }));
    expect(r.status).toBe('fail');
    expect(r.blocking).toBe(true);
    expect(r.reasons).toContain('renal_physiology_not_pathology');
  });

  it('warns when pathology signal is weak', () => {
    const r = validateSubjectSystem(q('Pathology', 'Renal / Urinary', { stem: GENERIC_STEM }));
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
    expect(r.reasons).toContain('renal_pathology_signal_weak');
  });
});

// ── Undeclared subject/system ─────────────────────────────────────────────────

describe('undeclared subject or system', () => {
  it('warns when subject is missing', () => {
    const r = validateSubjectSystem({ system: 'Cardiovascular' });
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
    expect(r.reasons).toContain('subject_system_not_fully_declared');
  });

  it('warns when system is missing', () => {
    const r = validateSubjectSystem({ subject: 'Pharmacology' });
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
    expect(r.reasons).toContain('subject_system_not_fully_declared');
  });

  it('warns when both subject and system are missing', () => {
    const r = validateSubjectSystem({});
    expect(r.status).toBe('warn');
    expect(r.blocking).toBe(false);
    expect(r.reasons).toContain('subject_system_not_fully_declared');
  });
});
