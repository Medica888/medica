import { describe, it, expect } from 'vitest';
import { validateTopic } from './topicValidator.js';
import type { ValidationQuestion } from './validationTypes.js';

// Minimal question builder — only fields topic validator cares about
function q(overrides: Partial<ValidationQuestion> = {}): ValidationQuestion {
  return {
    subject:      'Pharmacology',
    system:       'Cardiovascular',
    topic:        'ACE Inhibitors',
    canonicalTopic: '',
    rawTopic:     '',
    testedConcept: '',
    weakSpotCategory: '',
    questionAngle: '',
    usmleContentArea: '',
    usmleSubdomain: '',
    physicianTask: '',
    stem:         'A patient presents with hypertension.',
    options:      [{ letter: 'A', text: 'correct' }, { letter: 'B', text: 'wrong' }, { letter: 'C', text: 'wrong' }, { letter: 'D', text: 'wrong' }],
    correct:      'A',
    explanation:  'ACE inhibitors reduce afterload.',
    difficulty:   'Medium',
    ...overrides,
  };
}

// ── No-op cases ──────────────────────────────────────────────────────────────

describe('validateTopic — no-op cases', () => {
  it('passes when topic is absent', () => {
    const result = validateTopic(q({ topic: '', canonicalTopic: '', rawTopic: '' }));
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(false);
    expect(result.reasons).toContain('no_topic_present');
  });

  it('passes when subject is unresolved', () => {
    const result = validateTopic(q({ subject: 'Unknownology' }));
    expect(result.status).toBe('pass');
    expect(result.reasons).toContain('subject_or_system_unresolved');
  });

  it('passes when system is unresolved', () => {
    const result = validateTopic(q({ system: 'Unknown System' }));
    expect(result.status).toBe('pass');
    expect(result.reasons).toContain('subject_or_system_unresolved');
  });
});

// ── PASS — canonical match ───────────────────────────────────────────────────

describe('validateTopic — PASS cases', () => {
  it('passes for exact canonical in correct pair', () => {
    const result = validateTopic(q({ topic: 'ACE Inhibitors', subject: 'Pharmacology', system: 'Cardiovascular' }));
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(false);
    expect(result.score).toBe(100);
    expect(result.reasons).toEqual([]);
  });

  it('passes for case-normalized canonical (ACE inhibitors → ACE Inhibitors)', () => {
    const result = validateTopic(q({ topic: 'ACE inhibitors', subject: 'Pharmacology', system: 'Cardiovascular' }));
    expect(result.status).toBe('pass');
    expect(result.reasons).toEqual([]);
  });

  it('passes for Loop Diuretics in Pharmacology × Renal / Urinary', () => {
    const result = validateTopic(q({ topic: 'Loop Diuretics', subject: 'Pharmacology', system: 'Renal / Urinary' }));
    expect(result.status).toBe('pass');
    expect(result.score).toBe(100);
  });

  it('passes for Tuberculosis in Microbiology × Respiratory', () => {
    const result = validateTopic(q({ topic: 'Tuberculosis', subject: 'Microbiology', system: 'Respiratory' }));
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(false);
  });
});

// ── PASS (with alias note) ────────────────────────────────────────────────────

describe('validateTopic — alias match in correct pair', () => {
  it('passes for ACEI (alias) in Pharmacology × Cardiovascular — notes topic_alias_used', () => {
    const result = validateTopic(q({ topic: 'ACEI' }));
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(false);
    expect(result.score).toBe(100);
    expect(result.reasons).toContain('topic_alias_used');
  });

  it('passes for TB (alias) in Microbiology × Respiratory — notes alias', () => {
    const result = validateTopic(q({ topic: 'TB', subject: 'Microbiology', system: 'Respiratory' }));
    expect(result.status).toBe('pass');
    expect(result.reasons).toContain('topic_alias_used');
  });

  it('passes for "loop diuretic" (alias) in Pharmacology × Renal / Urinary', () => {
    const result = validateTopic(q({ topic: 'loop diuretic', subject: 'Pharmacology', system: 'Renal / Urinary' }));
    expect(result.status).toBe('pass');
    expect(result.reasons).toContain('topic_alias_used');
  });
});

// ── WARN — unknown topic ──────────────────────────────────────────────────────

describe('validateTopic — WARN for unknown topic', () => {
  it('warns for topic not in taxonomy', () => {
    const result = validateTopic(q({ topic: 'NewTopicWeMissed' }));
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.reasons).toContain('topic_unknown');
  });

  it('warns non-blocking for unknown topic with valid pair', () => {
    const result = validateTopic(q({ topic: 'SomeEsotericPharmTopic', subject: 'Pharmacology', system: 'Cardiovascular' }));
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.score).toBeGreaterThan(0);
  });
});

// ── WARN — cross-cutting (one dim differs) ────────────────────────────────────

describe('validateTopic — WARN for one-dimension mismatch', () => {
  it('warns when topic is in different system (same subject)', () => {
    // Antifungals lives in Pharmacology × Infectious Disease
    // Tagged as Pharmacology × Respiratory → system differs, subject matches → WARN
    const result = validateTopic(q({ topic: 'Antifungals', subject: 'Pharmacology', system: 'Respiratory' }));
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.reasons).toContain('topic_in_different_system');
  });

  it('warns when topic is in different subject (same system)', () => {
    // Tuberculosis lives in Microbiology × Respiratory
    // Tagged as Pharmacology × Respiratory → subject differs, system matches → WARN
    const result = validateTopic(q({ topic: 'Tuberculosis', subject: 'Pharmacology', system: 'Respiratory' }));
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.reasons).toContain('topic_in_different_subject');
  });
});

// ── FAIL — both dimensions differ ─────────────────────────────────────────────

describe('validateTopic — FAIL for both-dimension mismatch', () => {
  it('fails and blocks when Tuberculosis is tagged Pharmacology × Renal/Urinary', () => {
    // TB home: Microbiology × Respiratory — both subject AND system differ
    const result = validateTopic(q({
      topic: 'Tuberculosis',
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
    }));
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(true);
    expect(result.score).toBe(0);
    expect(result.reasons).toContain('topic_subject_system_mismatch');
  });

  it('fails and blocks when Parkinson Disease is tagged Microbiology × Respiratory', () => {
    // Parkinson Disease home: Pathology × Neurology — both differ from Microbiology × Respiratory
    const result = validateTopic(q({
      topic: 'Parkinson Disease',
      subject: 'Microbiology',
      system: 'Respiratory',
    }));
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(true);
    expect(result.reasons).toContain('topic_subject_system_mismatch');
  });

  it('fails for TB alias (MTB) tagged Pharmacology × Endocrine', () => {
    // TB alias resolution → Microbiology × Respiratory; Pharmacology × Endocrine — both differ
    const result = validateTopic(q({
      topic: 'MTB',
      subject: 'Pharmacology',
      system: 'Endocrine',
    }));
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(true);
  });
});

// ── Score invariants ──────────────────────────────────────────────────────────

describe('validateTopic — score invariants', () => {
  it('pass score is 100', () => {
    const r = validateTopic(q({ topic: 'ACE Inhibitors' }));
    expect(r.score).toBe(100);
  });

  it('unknown topic warn score is > 0', () => {
    const r = validateTopic(q({ topic: 'Unknown2024' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('fail score is 0', () => {
    const r = validateTopic(q({ topic: 'Tuberculosis', subject: 'Pharmacology', system: 'Renal / Urinary' }));
    expect(r.score).toBe(0);
  });
});
