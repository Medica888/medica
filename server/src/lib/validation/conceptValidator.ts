import { normalizeSubject, normalizeSystem } from '../medicaTaxonomy.js';
import { lookupConcept } from '../medicaConceptTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from './validationTypes.js';

/**
 * Validates that the question's testedConcept is a recognized Step 1 concept for its Subject × System pair.
 *
 * PASS   — concept found in taxonomy, EXACT canonical key match, subject+system both match
 * WARN   — concept found in taxonomy via alias/normalization (per spec: recognized after normalization → WARN)
 * WARN   — concept found in taxonomy, one dimension (subject OR system) differs (cross-cutting)
 * WARN   — concept found in alsoAllowedIn pairs (legitimate cross-cutting, soft allow)
 * WARN   — concept not found in taxonomy (beta discovery mode — unknown, not blocked)
 * FAIL   — concept found in taxonomy, BOTH subject AND system differ from home pair, AND not in alsoAllowedIn
 * PASS   — concept absent, subject/system unresolved (no-op)
 */
export function validateConcept(question: ValidationQuestion): ValidatorResult {
  const raw = question.testedConcept || '';
  if (!raw.trim()) {
    return noopPass('no_concept_present');
  }

  const subject = normalizeSubject(question.subject);
  const system  = normalizeSystem(question.system);

  if (!subject || !system) {
    return noopPass('subject_or_system_unresolved');
  }

  const found = lookupConcept(raw);

  // ── Unknown concept — WARN (beta discovery mode) ──────────────────────────
  if (!found) {
    return {
      name: 'concept',
      status: 'warn',
      blocking: false,
      score: 80,
      expected: `known concept for ${subject} + ${system}`,
      detected: raw.trim(),
      confidence: 0.3,
      reasons: ['concept_unknown'],
    };
  }

  const subjectMatch = found.subject === subject;
  const systemMatch  = found.system  === system;

  // ── Alias match in right pair — WARN (per spec: recognized after normalization) ────
  // This diverges intentionally from topicValidator which PASSes on wasAlias.
  if (found.wasAlias && subjectMatch && systemMatch) {
    return {
      name: 'concept',
      status: 'warn',
      blocking: false,
      score: 90,
      expected: found.canonical,
      detected: raw.trim(),
      confidence: 0.8,
      reasons: ['concept_alias_used'],
    };
  }

  // ── Exact canonical, right pair — PASS ─────────────────────────────────────
  if (!found.wasAlias && subjectMatch && systemMatch) {
    return {
      name: 'concept',
      status: 'pass',
      blocking: false,
      score: 100,
      expected: `${found.canonical} in ${subject} + ${system}`,
      detected: found.canonical,
      confidence: 0.95,
      reasons: [],
    };
  }

  // ── Wrong pair (always true here — right-pair cases returned above) ─────────
  if (found.alsoAllowedIn?.some(p => p.subject === subject && p.system === system)) {
    return {
      name: 'concept',
      status: 'warn',
      blocking: false,
      score: 75,
      expected: `concept from ${subject} + ${system}`,
      detected: `${found.canonical} home: ${found.subject} + ${found.system} (cross-cutting allowed)`,
      confidence: 0.7,
      reasons: ['concept_cross_cutting'],
    };
  }

  // ── Both dims differ — FAIL (blocking) ─────────────────────────────────────
  if (!subjectMatch && !systemMatch) {
    return {
      name: 'concept',
      status: 'fail',
      blocking: true,
      score: 0,
      expected: `concept from ${subject} + ${system}`,
      detected: `${found.canonical} belongs to ${found.subject} + ${found.system}`,
      confidence: 0.9,
      reasons: ['concept_subject_system_mismatch'],
    };
  }

  // ── One dimension differs — WARN ────────────────────────────────────────────
  const reason = !subjectMatch ? 'concept_in_different_subject' : 'concept_in_different_system';
  return {
    name: 'concept',
    status: 'warn',
    blocking: false,
    score: 70,
    expected: `concept from ${subject} + ${system}`,
    detected: `${found.canonical} home: ${found.subject} + ${found.system}`,
    confidence: 0.6,
    reasons: [reason],
  };
}

function noopPass(reason: string): ValidatorResult {
  return {
    name: 'concept',
    status: 'pass',
    blocking: false,
    score: 100,
    expected: '',
    detected: '',
    confidence: 1,
    reasons: [reason],
  };
}
