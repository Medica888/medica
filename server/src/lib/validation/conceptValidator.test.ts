import { describe, it, expect } from 'vitest';
import { validateConcept } from './conceptValidator.js';
import type { ValidationQuestion } from './validationTypes.js';

function q(overrides: Partial<ValidationQuestion>): ValidationQuestion {
  return {
    subject: 'Pharmacology',
    system: 'Renal / Urinary',
    difficulty: 'Medium',
    testedConcept: '',
    ...overrides,
  };
}

// ── No-op PASS cases ──────────────────────────────────────────────────────────

describe('validateConcept — no-op PASS', () => {
  it('returns PASS when testedConcept is absent', () => {
    const result = validateConcept(q({ testedConcept: '' }));
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(false);
    expect(result.reasons).toContain('no_concept_present');
  });

  it('returns PASS when subject is unresolved', () => {
    const result = validateConcept(q({ subject: '', testedConcept: 'Na-K-2Cl Transporter Inhibition' }));
    expect(result.status).toBe('pass');
    expect(result.reasons).toContain('subject_or_system_unresolved');
  });

  it('returns PASS when system is unresolved', () => {
    const result = validateConcept(q({ system: '', testedConcept: 'Na-K-2Cl Transporter Inhibition' }));
    expect(result.status).toBe('pass');
    expect(result.reasons).toContain('subject_or_system_unresolved');
  });

  it('returns score=100 on all no-op PASSes', () => {
    expect(validateConcept(q({ testedConcept: '' })).score).toBe(100);
    expect(validateConcept(q({ subject: '', testedConcept: 'anything' })).score).toBe(100);
  });
});

// ── PASS — exact canonical match in correct pair ──────────────────────────────

describe('validateConcept — PASS (exact canonical, correct pair)', () => {
  it('PASS: Loop Diuretics + Na-K-2Cl Transporter Inhibition (exact canonical)', () => {
    const result = validateConcept(q({
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      testedConcept: 'Na-K-2Cl Transporter Inhibition',
    }));
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(false);
    expect(result.score).toBe(100);
    expect(result.confidence).toBeCloseTo(0.95);
    expect(result.reasons).toHaveLength(0);
  });

  it('PASS: Multiple Sclerosis + Periventricular Plaques on MRI (exact canonical)', () => {
    const result = validateConcept(q({
      subject: 'Pathology',
      system: 'Neurology',
      testedConcept: 'Periventricular Plaques on MRI',
    }));
    expect(result.status).toBe('pass');
    expect(result.score).toBe(100);
  });

  it('PASS: Insulin + Insulin GLUT4 Translocation', () => {
    const result = validateConcept(q({
      subject: 'Pharmacology',
      system: 'Endocrine',
      testedConcept: 'Insulin GLUT4 Translocation',
    }));
    expect(result.status).toBe('pass');
    expect(result.score).toBe(100);
  });
});

// ── WARN — alias / normalized match ──────────────────────────────────────────

describe('validateConcept — WARN (alias match, correct pair)', () => {
  it('WARN: Loop Diuretics + "NKCC2 inhibition" (alias for Na-K-2Cl Transporter Inhibition)', () => {
    const result = validateConcept(q({
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      testedConcept: 'NKCC2 inhibition',
    }));
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.score).toBe(90);
    expect(result.reasons).toContain('concept_alias_used');
    expect(result.detected).toBe('NKCC2 inhibition');
  });

  it('WARN: Parkinson + "Lewy bodies Parkinson" (alias match)', () => {
    const result = validateConcept(q({
      subject: 'Pathology',
      system: 'Neurology',
      testedConcept: 'Lewy bodies Parkinson',
    }));
    expect(result.status).toBe('warn');
    expect(result.reasons).toContain('concept_alias_used');
  });

  it('WARN: "furosemide hypokalemia" maps to Loop Diuretic Hypokalemia in correct pair', () => {
    const result = validateConcept(q({
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      testedConcept: 'furosemide hypokalemia',
    }));
    expect(result.status).toBe('warn');
    expect(result.reasons).toContain('concept_alias_used');
  });
});

// ── WARN — unknown concept ────────────────────────────────────────────────────

describe('validateConcept — WARN (unknown concept)', () => {
  it('WARN: known topic pair + completely unknown concept', () => {
    const result = validateConcept(q({
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      testedConcept: 'Loop-induced Hypokalemia',
    }));
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.score).toBe(80);
    expect(result.reasons).toContain('concept_unknown');
    expect(result.confidence).toBeCloseTo(0.3);
  });

  it('WARN: any unknown concept does not block', () => {
    const result = validateConcept(q({
      testedConcept: 'Invented Concept That Does Not Exist',
    }));
    expect(result.blocking).toBe(false);
    expect(result.status).toBe('warn');
  });
});

// ── WARN — cross-cutting (one dim differs) ────────────────────────────────────

describe('validateConcept — WARN (one dimension differs)', () => {
  it('WARN: concept in same subject but different system', () => {
    // Loop Diuretic Hypokalemia (Pharmacology × Renal)
    // question tagged as Pharmacology × Cardiovascular
    const result = validateConcept(q({
      subject: 'Pharmacology',
      system: 'Cardiovascular',
      testedConcept: 'Loop Diuretic Hypokalemia',
    }));
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.reasons).toContain('concept_in_different_system');
  });

  it('WARN: concept in same system but different subject', () => {
    // Na-K-2Cl Transporter Inhibition (Pharmacology × Renal)
    // question tagged as Physiology × Renal
    const result = validateConcept(q({
      subject: 'Physiology',
      system: 'Renal / Urinary',
      testedConcept: 'Na-K-2Cl Transporter Inhibition',
    }));
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.reasons).toContain('concept_in_different_subject');
  });
});

// ── WARN — alsoAllowedIn cross-cutting ───────────────────────────────────────

describe('validateConcept — WARN (alsoAllowedIn cross-cutting)', () => {
  it('WARN not FAIL: Anion Gap Calculation in Pathology × Endocrine (alsoAllowedIn)', () => {
    const result = validateConcept(q({
      subject: 'Pathology',
      system: 'Endocrine',
      testedConcept: 'Anion Gap Calculation',
    }));
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.reasons).toContain('concept_cross_cutting');
  });

  it('WARN not FAIL: SSRI Serotonin Syndrome in Pharmacology × Neurology (alsoAllowedIn)', () => {
    const result = validateConcept(q({
      subject: 'Pharmacology',
      system: 'Neurology',
      testedConcept: 'SSRI Serotonin Syndrome',
    }));
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.reasons).toContain('concept_cross_cutting');
  });
});

// ── FAIL — both dimensions differ ────────────────────────────────────────────
// These are the spec's stated FAIL examples.

describe('validateConcept — FAIL (both subject AND system differ)', () => {
  it('FAIL: Loop Diuretics + Lewy Body Alpha-Synuclein Pathology', () => {
    // Loop Diuretics: Pharmacology × Renal
    // Lewy Body: Pathology × Neurology — both dims differ
    const result = validateConcept(q({
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      testedConcept: 'Lewy Body Alpha-Synuclein Pathology',
    }));
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(true);
    expect(result.score).toBe(0);
    expect(result.reasons).toContain('concept_subject_system_mismatch');
  });

  it('FAIL: Microbiology × Infectious Disease + Na-K-2Cl Transporter Inhibition (transport pharm concept on TB question)', () => {
    // Na-K-2Cl: Pharmacology × Renal — both differ from Microbiology × ID
    const result = validateConcept(q({
      subject: 'Microbiology',
      system: 'Infectious Disease',
      testedConcept: 'Na-K-2Cl Transporter Inhibition',
    }));
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(true);
    expect(result.reasons).toContain('concept_subject_system_mismatch');
  });

  it('FAIL: Pathology × Neurology + Heparin Antithrombin III Mechanism (anticoag concept on neuro question)', () => {
    // Heparin: Pharmacology × Hematology — both differ from Pathology × Neurology
    const result = validateConcept(q({
      subject: 'Pathology',
      system: 'Neurology',
      testedConcept: 'Heparin Antithrombin III Mechanism',
    }));
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(true);
  });

  it('FAIL result is always blocking=true and score=0', () => {
    const result = validateConcept(q({
      subject: 'Microbiology',
      system: 'Infectious Disease',
      testedConcept: 'Statin Myopathy',
    }));
    expect(result.blocking).toBe(true);
    expect(result.score).toBe(0);
  });
});

// ── Score invariants ──────────────────────────────────────────────────────────

describe('validateConcept — score invariants', () => {
  it('PASS has score=100', () => {
    const result = validateConcept(q({ testedConcept: 'Na-K-2Cl Transporter Inhibition' }));
    expect(result.score).toBe(100);
  });

  it('alias WARN has score=90', () => {
    const result = validateConcept(q({ testedConcept: 'NKCC2 inhibition' }));
    expect(result.score).toBe(90);
  });

  it('unknown WARN has score=80', () => {
    const result = validateConcept(q({ testedConcept: 'Hypokalemia Unknown Concept' }));
    expect(result.score).toBe(80);
  });

  it('cross-cutting alsoAllowedIn WARN has score=75', () => {
    const result = validateConcept(q({
      subject: 'Pathology',
      system: 'Endocrine',
      testedConcept: 'Anion Gap Calculation',
    }));
    expect(result.score).toBe(75);
  });

  it('one-dim mismatch WARN has score=70', () => {
    const result = validateConcept(q({
      subject: 'Pharmacology',
      system: 'Cardiovascular',
      testedConcept: 'Loop Diuretic Hypokalemia',
    }));
    expect(result.score).toBe(70);
  });

  it('FAIL has score=0', () => {
    const result = validateConcept(q({
      subject: 'Microbiology',
      system: 'Infectious Disease',
      testedConcept: 'Statin Myopathy',
    }));
    expect(result.score).toBe(0);
  });
});

// ── Blocking invariant ────────────────────────────────────────────────────────

describe('validateConcept — blocking invariant', () => {
  it('only FAIL status has blocking=true', () => {
    const statuses: Array<{ status: string; blocking: boolean }> = [
      validateConcept(q({ testedConcept: '' })),                              // no-op PASS
      validateConcept(q({ testedConcept: 'Na-K-2Cl Transporter Inhibition' })), // PASS
      validateConcept(q({ testedConcept: 'NKCC2 inhibition' })),               // WARN alias
      validateConcept(q({ testedConcept: 'Unknown Concept XYZ 123' })),        // WARN unknown
    ];
    for (const r of statuses) {
      expect(r.blocking).toBe(false);
    }
    // FAIL case
    const fail = validateConcept(q({
      subject: 'Microbiology',
      system: 'Infectious Disease',
      testedConcept: 'Statin Myopathy',
    }));
    expect(fail.blocking).toBe(true);
  });
});

// ── Name invariant ────────────────────────────────────────────────────────────

describe('validateConcept — validator name', () => {
  it('always returns name="concept"', () => {
    const cases = [
      q({ testedConcept: '' }),
      q({ testedConcept: 'Na-K-2Cl Transporter Inhibition' }),
      q({ testedConcept: 'NKCC2 inhibition' }),
      q({ testedConcept: 'Unknown Concept' }),
    ];
    for (const c of cases) {
      expect(validateConcept(c).name).toBe('concept');
    }
  });
});
