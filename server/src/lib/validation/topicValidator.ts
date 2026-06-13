import { normalizeSubject, normalizeSystem } from '../medicaTaxonomy.js';
import { resolveTopicAlias } from '../../services/TaxonomyResolutionService.js';
import type { ValidationQuestion, ValidatorResult } from './validationTypes.js';

/**
 * Validates that the question's topic is a recognized Step 1 topic for its Subject × System pair.
 *
 * PASS   — topic found in taxonomy, exact canonical match, subject+system both match
 * PASS   — topic found in taxonomy, alias used (same pair) — wasAlias is noted but not penalised
 * WARN   — topic found in taxonomy but one dimension differs (cross-cutting, discovery)
 * WARN   — topic not found in taxonomy at all (beta discovery mode — unknown, not blocked)
 * FAIL   — topic found in taxonomy, BOTH subject AND system differ from home pair (clear mismatch)
 * PASS   — topic absent, subject/system unknown/absent, or pair is unrecognized (no-op)
 */
export function validateTopic(question: ValidationQuestion): ValidatorResult {
  const raw = question.topic || question.canonicalTopic || question.rawTopic || '';
  if (!raw.trim()) {
    return noopPass('no_topic_present');
  }

  const subject = normalizeSubject(question.subject);
  const system  = normalizeSystem(question.system);

  // No-op when the pair cannot be evaluated (unknown subject or system).
  if (!subject || !system) {
    return noopPass('subject_or_system_unresolved');
  }

  const found = resolveTopicAlias(raw);

  // ── Unknown topic — WARN (beta discovery mode) ────────────────────────────
  if (!found) {
    return {
      name: 'topic',
      status: 'warn',
      blocking: false,
      score: 80,
      expected: `known topic for ${subject} + ${system}`,
      detected: raw.trim(),
      confidence: 0.3,
      reasons: ['topic_unknown'],
    };
  }

  const subjectMatch = found.subject === subject;
  const systemMatch  = found.system  === system;

  // ── Exact home (canonical or alias) — PASS ────────────────────────────────
  if (subjectMatch && systemMatch) {
    return {
      name: 'topic',
      status: 'pass',
      blocking: false,
      score: 100,
      expected: `${found.canonical} in ${subject} + ${system}`,
      detected: found.canonical,
      confidence: found.wasAlias ? 0.85 : 0.95,
      reasons: found.wasAlias
        ? [found.aliasSource === 'runtime_alias' ? 'runtime_alias_used' : 'topic_alias_used']
        : [],
    };
  }

  // ── Both dimensions differ — FAIL (blocking) ─────────────────────────────
  // This is the only case we block. A topic clearly assigned to a different
  // subject AND system cannot belong to this question's pair.
  if (!subjectMatch && !systemMatch) {
    return {
      name: 'topic',
      status: 'fail',
      blocking: true,
      score: 0,
      expected: `topic from ${subject} + ${system}`,
      detected: `${found.canonical} belongs to ${found.subject} + ${found.system}`,
      confidence: 0.9,
      reasons: ['topic_subject_system_mismatch'],
    };
  }

  // ── One dimension differs — WARN (cross-cutting, discovery) ──────────────
  // Common for legitimate cross-cutting questions (e.g., antifungals tagged
  // Pharmacology+Respiratory when home is Pharmacology+InfectiousDisease).
  const reason = !subjectMatch ? 'topic_in_different_subject' : 'topic_in_different_system';
  return {
    name: 'topic',
    status: 'warn',
    blocking: false,
    score: 70,
    expected: `topic from ${subject} + ${system}`,
    detected: `${found.canonical} home: ${found.subject} + ${found.system}`,
    confidence: 0.6,
    reasons: [reason],
  };
}

function noopPass(reason: string): ValidatorResult {
  return {
    name: 'topic',
    status: 'pass',
    blocking: false,
    score: 100,
    expected: '',
    detected: '',
    confidence: 1,
    reasons: [reason],
  };
}
