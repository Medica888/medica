/**
 * TaxonomyResolutionService — single public normalization layer for Medica taxonomy lookups.
 *
 * ── Full resolution pipeline ──────────────────────────────────────────────────
 *
 *  raw input string
 *    ↓  taxonomyKey() — strips punctuation, lowercases, &→and
 *    ↓  static taxonomy lookup (ALIAS_LOOKUP / CONCEPT_LOOKUP, built at module load)
 *       → canonical:     known, wasAlias = false  → aliasSource: 'canonical'
 *       → static alias:  known, wasAlias = true   → aliasSource: 'static_alias'
 *    ↓  runtime alias cache lookup (TaxonomyAliasService, loaded from DB at startup)
 *       → runtime alias: admin-approved mapping    → aliasSource: 'runtime_alias'
 *    ↓  unknown → null
 *       → topicValidator/conceptValidator emit WARN + reason 'topic_unknown'/'concept_unknown'
 *       → captureUnknownTopicCandidates / captureUnknownConceptCandidates persist to DB
 *         with type: 'topic' | 'concept' and status: 'pending'
 *       → admin reviews via GET /taxonomy-candidates, approves via PATCH /:id/status
 *         setting status to 'mapped_alias' (rawLabel → metadata.mappedTo) or
 *         'approved_canonical' (rawLabel itself becomes canonical)
 *       → PATCH handler fires refreshCache() — cache is reloaded from DB immediately
 *       → next request sees the approved mapping via aliasSource: 'runtime_alias'
 *
 * ── Topic candidates vs. concept candidates ───────────────────────────────────
 *
 *  Topic candidates (type: 'topic'):
 *    Captured when a question's topic/canonicalTopic is unknown.  Admin approval adds
 *    the label to the runtime TOPIC cache.  The validator then resolves unknown topics
 *    to their canonical form rather than emitting 'topic_unknown'.
 *
 *  Concept candidates (type: 'concept'):
 *    Captured when a question's testedConcept is unknown.  Admin approval adds the
 *    label to the runtime CONCEPT cache.  crucially, the mastery bridge
 *    (conceptBridgeUtils) also calls resolveConceptAlias before slugifying, so
 *    approved concept aliases consolidate mastery rows with their canonical form.
 *
 * ── Forward-only mastery consolidation ───────────────────────────────────────
 *
 *  Mastery consolidation (via resolveConceptAlias in canonicalConceptToMasteryKey) is
 *  write-side only: NEW sessions write the canonical slug.  Pre-existing mastery rows
 *  that were written with a raw alias slug before the fix are NOT retroactively merged.
 *  This is acceptable because:
 *    1. Split rows only overstate concept-level granularity; they do not corrupt totals.
 *    2. A future migration can merge them by slug-grouping the concepts table if needed.
 *    3. The fix prevents ALL new fragmentation — the backlog is bounded.
 */

import { lookupTopic }   from '../lib/medicaTopicTaxonomy.js';
import { lookupConcept } from '../lib/medicaConceptTaxonomy.js';
import type { TopicLookupResult }   from '../lib/medicaTopicTaxonomy.js';
import type { ConceptLookupResult } from '../lib/medicaConceptTaxonomy.js';
import type { ITaxonomyCandidatesRepository } from '../repositories/interfaces.js';
import { TaxonomyAliasService } from './TaxonomyAliasService.js';

export type AliasSource = 'canonical' | 'static_alias' | 'runtime_alias';

export type ResolvedTopicResult   = TopicLookupResult   & { readonly aliasSource: AliasSource };
export type ResolvedConceptResult = ConceptLookupResult & { readonly aliasSource: AliasSource };

export interface AliasMetrics {
  approvedRuntimeAliases: number;
  topicAliasCount:        number;
  conceptAliasCount:      number;
  topicAliasHitCount:     number;
  conceptAliasHitCount:   number;
}
export class TaxonomyResolutionService {
  constructor(private readonly aliasService: TaxonomyAliasService) {}

  async loadApprovedAliases(repo: ITaxonomyCandidatesRepository): Promise<void> {
    await this.aliasService.loadApprovedAliases(repo);
  }

  async refreshCache(repo: ITaxonomyCandidatesRepository): Promise<void> {
    await this.aliasService.loadApprovedAliases(repo);
  }

  /**
   * Resolution order:
   * 1. Exact canonical match in static taxonomy               → aliasSource: 'canonical'
   * 2. Static alias match in static taxonomy                  → aliasSource: 'static_alias'
   * 3. Runtime approved alias found in alias cache            → aliasSource: 'runtime_alias'
   *    (canonical must itself resolve in static taxonomy for subject+system to be supplied)
   * 4. Unknown                                                → null
   */
  resolveTopicAlias(raw: string): ResolvedTopicResult | null {
    // Steps 1+2: static lookup handles both canonical and alias keys
    const staticFound = lookupTopic(raw);
    if (staticFound) {
      return { ...staticFound, aliasSource: staticFound.wasAlias ? 'static_alias' : 'canonical' };
    }

    // Step 3: runtime alias cache
    const runtimeCanonical = this.aliasService.lookupTopicAlias(raw);
    if (runtimeCanonical) {
      const canonicalEntry = lookupTopic(runtimeCanonical);
      if (canonicalEntry) {
        return { ...canonicalEntry, wasAlias: true, aliasSource: 'runtime_alias' };
      }
      // runtimeCanonical exists in the cache but is not in the static taxonomy.
      // This happens when an admin approves a candidate as 'approved_canonical' for a
      // genuinely new topic that has not yet been added to TOPIC_TAXONOMY.  Without a
      // static entry, subject+system cannot be supplied, so we fall through to null.
      // This is intentional: the validator will still emit 'topic_unknown' (a WARN),
      // prompting the admin to also add the topic to the static taxonomy.
    }

    return null;
  }

  /**
   * Same four-step chain for concepts. Returns ConceptLookupResult-compatible shape.
   */
  resolveConceptAlias(raw: string): ResolvedConceptResult | null {
    // Steps 1+2: static lookup
    const staticFound = lookupConcept(raw);
    if (staticFound) {
      return { ...staticFound, aliasSource: staticFound.wasAlias ? 'static_alias' : 'canonical' };
    }

    // Step 3: runtime alias cache
    const runtimeCanonical = this.aliasService.lookupConceptAlias(raw);
    if (runtimeCanonical) {
      const canonicalEntry = lookupConcept(runtimeCanonical);
      if (canonicalEntry) {
        return { ...canonicalEntry, wasAlias: true, aliasSource: 'runtime_alias' };
      }
      // Same approved_canonical edge case as topics: canonical not in static taxonomy yet.
      // We return null; conceptBridgeUtils will fall back to the raw input string
      // for the mastery slug — no consolidation benefit until the canonical is also
      // added to CONCEPT_TAXONOMY.  'mapped_alias' (which always points to an existing
      // canonical) is the operationally useful status for concept alias consolidation.
    }

    return null;
  }

  getAliasMetrics(): AliasMetrics {
    return {
      approvedRuntimeAliases: this.aliasService.topicCacheSize + this.aliasService.conceptCacheSize,
      topicAliasCount:        this.aliasService.topicCacheSize,
      conceptAliasCount:      this.aliasService.conceptCacheSize,
      topicAliasHitCount:     this.aliasService.topicHitCount,
      conceptAliasHitCount:   this.aliasService.conceptHitCount,
    };
  }
}

// ── Module singletons ─────────────────────────────────────────────────────────
// Validators and mastery utils import the helper functions below;
// index.ts calls taxonomyResolutionService.loadApprovedAliases() at startup;
// ai.ts calls taxonomyResolutionService.refreshCache() after admin status updates.

export const taxonomyAliasService      = new TaxonomyAliasService();
export const taxonomyResolutionService = new TaxonomyResolutionService(taxonomyAliasService);

export function resolveTopicAlias(raw: string): ResolvedTopicResult | null {
  return taxonomyResolutionService.resolveTopicAlias(raw);
}

export function resolveConceptAlias(raw: string): ResolvedConceptResult | null {
  return taxonomyResolutionService.resolveConceptAlias(raw);
}
