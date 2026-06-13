import type { ITaxonomyCandidatesRepository } from '../repositories/interfaces.js';
import { taxonomyKey } from '../lib/medicaTopicTaxonomy.js';

/**
 * Internal alias cache — loads approved taxonomy candidates from the DB and stores
 * them in O(1) lookup maps keyed by the taxonomy normalization function (taxonomyKey).
 *
 * Not consumed directly by application code: use TaxonomyResolutionService instead.
 */
export class TaxonomyAliasService {
  private topicCache   = new Map<string, string>(); // taxonomyKey(rawLabel) → canonical
  private conceptCache = new Map<string, string>(); // taxonomyKey(rawLabel) → canonical
  private _topicHits   = 0;
  private _conceptHits = 0;

  async loadApprovedAliases(repo: ITaxonomyCandidatesRepository): Promise<void> {
    const [mappedAliases, approvedCanonicals] = await Promise.all([
      repo.findUnknownTopicCandidates({ status: 'mapped_alias',        limit: 200 }),
      repo.findUnknownTopicCandidates({ status: 'approved_canonical',  limit: 200 }),
    ]);

    const topicNew   = new Map<string, string>();
    const conceptNew = new Map<string, string>();

    for (const candidate of [...mappedAliases, ...approvedCanonicals]) {
      // mapped_alias: canonical = metadata.mappedTo (the target). No fallback — an alias without
      // a destination is invalid and must be skipped.
      // approved_canonical: the candidate itself is canonical; use normalizedGuess or rawLabel.
      const canonical =
        candidate.status === 'mapped_alias'
          ? String(candidate.metadata.mappedTo ?? '')
          : candidate.normalizedGuess || candidate.rawLabel;

      if (!canonical.trim()) continue;

      const cacheKey = taxonomyKey(candidate.rawLabel);
      if (candidate.type === 'concept') {
        conceptNew.set(cacheKey, canonical);
      } else {
        topicNew.set(cacheKey, canonical);
      }
    }

    this.topicCache   = topicNew;
    this.conceptCache = conceptNew;
  }

  lookupTopicAlias(raw: string): string | null {
    const hit = this.topicCache.get(taxonomyKey(raw));
    if (hit !== undefined) this._topicHits++;
    return hit ?? null;
  }

  lookupConceptAlias(raw: string): string | null {
    const hit = this.conceptCache.get(taxonomyKey(raw));
    if (hit !== undefined) this._conceptHits++;
    return hit ?? null;
  }

  get topicCacheSize():   number { return this.topicCache.size; }
  get conceptCacheSize(): number { return this.conceptCache.size; }
  get topicHitCount():    number { return this._topicHits; }
  get conceptHitCount():  number { return this._conceptHits; }
}
