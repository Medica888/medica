import { randomUUID } from 'crypto';
import type { GeneratedBankStatus, IQuestionsRepository } from '../interfaces.js';
import type { CatalogQuestion, PaginatedResult } from '../../types/index.js';
import {
  difficultySearchLabels,
  isBroadTaxonomyValue,
  subjectSearchLabels,
  systemSearchLabels,
} from '../../lib/medicaTaxonomy.js';
import { computeQuestionFingerprint } from '../../lib/questionFingerprint.js';
import {
  isCommerciallyContentReady,
  mergeReviewedContentMetadataIntoBody,
  normalizeReviewedContentMetadata,
} from '../../lib/reviewedContentMetadata.js';

export class InMemoryQuestionsRepository implements IQuestionsRepository {
  private store = new Map<string, {
    id: string;
    subject: string;
    system: string;
    body: Record<string, unknown>;
    source: string;
    bankStatus: string;
    mode: string;
    difficulty: string;
    validationScore: number | null;
    validatedAt: Date | string | null;
    aiModel: string | null;
    validatorVersion: string | null;
    reviewMetadata: unknown;
    usageCount: number;
    lastUsedAt: Date | null;
  }>();

  private enrichEntry(externalId: string, entry: {
    subject: string;
    system: string;
    body: Record<string, unknown>;
    source: string;
    bankStatus: string;
    mode: string;
    difficulty: string;
    validationScore: number | null;
    validatedAt: Date | string | null;
    aiModel: string | null;
    validatorVersion: string | null;
    reviewMetadata?: unknown;
    usageCount: number;
    lastUsedAt: Date | null;
  }): Record<string, unknown> {
    const reviewMetadata = normalizeReviewedContentMetadata(entry.reviewMetadata ?? entry.body['reviewMetadata'], {
      bankStatus: entry.bankStatus,
      source: entry.source,
      aiModel: entry.aiModel,
      validatorVersion: entry.validatorVersion,
      body: entry.body,
    });
    const body = mergeReviewedContentMetadataIntoBody(entry.body, reviewMetadata);
    return {
      externalId,
      subject: entry.subject,
      system: entry.system,
      source: entry.source,
      bankStatus: entry.bankStatus,
      mode: entry.mode,
      difficulty: entry.difficulty,
      validationScore: entry.validationScore,
      validatedAt: entry.validatedAt,
      aiModel: entry.aiModel,
      validatorVersion: entry.validatorVersion,
      reviewMetadata,
      commercialReady: isCommerciallyContentReady({
        bankStatus: entry.bankStatus,
        difficulty: entry.difficulty,
        source: entry.source,
        aiModel: entry.aiModel,
        validatorVersion: entry.validatorVersion,
        body,
        reviewMetadata,
      }),
      lastUsedAt: entry.lastUsedAt,
      usageCount: entry.usageCount,
      reportCount: 0,
      body,
    };
  }

  async upsertByExternalId(
    externalId: string,
    data: {
      subject: string;
      system: string;
      body: Record<string, unknown>;
      source?: string;
      bankStatus?: string;
      mode?: string;
      difficulty?: string;
      validationScore?: number | null;
      validatedAt?: Date | string | null;
      aiModel?: string | null;
      validatorVersion?: string | null;
      reviewMetadata?: Record<string, unknown> | null;
    },
  ): Promise<{ id: string }> {
    const metadata = {
      source: data.source ?? String(data.body.source || 'unknown'),
      bankStatus: data.bankStatus ?? String(data.body.bankStatus || 'legacy'),
      mode: data.mode ?? String(data.body.mode || ''),
      difficulty: data.difficulty ?? String(data.body.difficulty || ''),
      validationScore: data.validationScore ?? (
        data.body.validationScore == null ? null : Number(data.body.validationScore)
      ),
      validatedAt: data.validatedAt ?? data.body.validatedAt as string | null ?? null,
      aiModel: data.aiModel ?? (String(data.body.aiModel || '') || null),
      validatorVersion: data.validatorVersion ?? (String(data.body.validatorVersion || data.body.validationVersion || '') || null),
    };
    const reviewMetadata = normalizeReviewedContentMetadata(data.reviewMetadata ?? data.body.reviewMetadata, {
      bankStatus: metadata.bankStatus,
      source: metadata.source,
      aiModel: metadata.aiModel,
      validatorVersion: metadata.validatorVersion,
      body: data.body,
    });
    const body = mergeReviewedContentMetadataIntoBody(data.body, reviewMetadata);
    const existing = this.store.get(externalId);
    if (existing) {
      this.store.set(externalId, { ...existing, ...data, body, ...metadata, reviewMetadata });
      return { id: existing.id };
    }
    const id = randomUUID();
    this.store.set(externalId, {
      id,
      ...data,
      body,
      ...metadata,
      reviewMetadata,
      usageCount: 0,
      lastUsedAt: null,
    });
    return { id };
  }

  async findByExternalId(externalId: string): Promise<{ id: string } | null> {
    const entry = this.store.get(externalId);
    return entry ? { id: entry.id } : null;
  }

  async findGeneratedBankQuestions(params: {
    subject?: string;
    system?: string;
    difficulty?: string;
    mode?: string;
    limit?: number;
    approvedOnly?: boolean;
  }): Promise<Record<string, unknown>[]> {
    const matchesRequested = (requested: string | undefined, actual: unknown, allLabels: string[]) => {
      const value = String(requested || '').trim();
      if (!value || allLabels.includes(value)) return true;
      return String(actual || '') === value;
    };
    const matchesTaxonomy = (
      requested: string | undefined,
      actual: unknown,
      labelsForValue: (v: unknown) => string[],
      allLabels: string[],
    ) => {
      const value = String(requested || '').trim();
      if (!value || allLabels.includes(value) || isBroadTaxonomyValue(value)) return true;
      const labels = labelsForValue(value);
      const searchLabels = labels.length > 0 ? labels : [value];
      return searchLabels.includes(String(actual || ''));
    };
    const limit = Math.max(1, Math.min(Number(params.limit) || 100, 200));
    const allowedStatuses = params.approvedOnly
      ? ['approved', 'restored']
      : ['validated_generated', 'approved', 'restored'];
    return [...this.store.values()]
      .filter(entry =>
        entry.source === 'ai'
        && allowedStatuses.includes(entry.bankStatus)
        && matchesTaxonomy(params.subject, entry.subject, subjectSearchLabels, ['All Subjects'])
        && matchesTaxonomy(params.system, entry.system, systemSearchLabels, ['Mixed / All Systems', 'All Systems'])
        && matchesTaxonomy(params.difficulty, entry.difficulty, difficultySearchLabels, [])
        && matchesRequested(params.mode, entry.mode, []),
      )
      .sort((a, b) => {
        const aActive = a.bankStatus === 'approved' || a.bankStatus === 'restored';
        const bActive = b.bankStatus === 'approved' || b.bankStatus === 'restored';
        if (aActive !== bActive) return aActive ? -1 : 1;
        return 0;
      })
      .map(entry => this.enrichEntry('', entry).body as Record<string, unknown>)
      .slice(0, limit);
  }

  async findGeneratedBankReview(params: {
    externalId?: string;
    status?: GeneratedBankStatus;
    limit?: number;
    offset?: number;
    sort?: 'priority' | 'newest' | 'score' | 'usage';
  }): Promise<Record<string, unknown>[]> {
    const limit = Math.max(1, Math.min(Number(params.limit) || 100, 200));
    const offset = Math.max(0, Number(params.offset) || 0);
    const sorter = (sort: string | undefined) => ([, a]: [string, typeof this.store extends Map<string, infer V> ? V : never], [, b]: [string, typeof this.store extends Map<string, infer V> ? V : never]): number => {
      if (sort === 'newest') return 0;
      if (sort === 'score') return (b.validationScore ?? -1) - (a.validationScore ?? -1);
      if (sort === 'usage') return b.usageCount - a.usageCount;
      // priority: failed candidates first, then pending generated, then lower score, then higher usage
      const statusPriority = (status: string) =>
        status === 'validation_failed' ? 0 :
        status === 'validated_generated' ? 1 :
        status === 'rejected' ? 3 : 2;
      const aStatus = statusPriority(a.bankStatus);
      const bStatus = statusPriority(b.bankStatus);
      if (aStatus !== bStatus) return aStatus - bStatus;
      const aScore = a.validationScore ?? 100;
      const bScore = b.validationScore ?? 100;
      if (aScore !== bScore) return aScore - bScore;
      return b.usageCount - a.usageCount;
    };
    return [...this.store.entries()]
      .filter(([eid, entry]) =>
        entry.source === 'ai'
        && (!params.externalId || eid === params.externalId)
        && (!params.status || entry.bankStatus === params.status)
      )
      .sort(sorter(params.sort))
      .slice(offset, offset + limit)
      .map(([externalId, entry]) => this.enrichEntry(externalId, entry));
  }

  async countGeneratedBankReview(params: {
    status?: GeneratedBankStatus;
  }): Promise<number> {
    return [...this.store.values()].filter(entry =>
      entry.source === 'ai'
      && (!params.status || entry.bankStatus === params.status)
    ).length;
  }

  async updateGeneratedBankStatus(
    externalId: string,
    status: GeneratedBankStatus,
  ): Promise<Record<string, unknown> | null> {
    const entry = this.store.get(externalId);
    if (!entry || entry.source !== 'ai') return null;
    const updated = {
      ...entry,
      bankStatus: status,
      body: {
        ...entry.body,
        bankStatus: status,
      },
    };
    this.store.set(externalId, updated);
    return this.enrichEntry(externalId, updated);
  }

  async updateReviewedContentMetadata(
    externalId: string,
    metadata: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const entry = this.store.get(externalId);
    if (!entry) return null;
    const reviewMetadata = normalizeReviewedContentMetadata(metadata, {
      bankStatus: entry.bankStatus,
      source: entry.source,
      aiModel: entry.aiModel,
      validatorVersion: entry.validatorVersion,
      body: entry.body,
    });
    const updated = {
      ...entry,
      reviewMetadata,
      body: mergeReviewedContentMetadataIntoBody(entry.body, reviewMetadata),
    };
    this.store.set(externalId, updated);
    return this.enrichEntry(externalId, updated);
  }

  async getGeneratedBankMetrics(): Promise<{
    total: number;
    legacy: number;
    validatedGenerated: number;
    approved: number;
    restored: number;
    quarantined: number;
    validationFailed: number;
    rejected: number;
    used: number;
    totalUsage: number;
    approvalRate: number;
    quarantineRate: number;
    averageValidationScore: number | null;
    averagePendingAgeDays: number | null;
    generatedLast7d: number;
  }> {
    const entries = [...this.store.values()].filter(entry => entry.source === 'ai');
    const approved = entries.filter(entry => entry.bankStatus === 'approved').length;
    const restored = entries.filter(entry => entry.bankStatus === 'restored').length;
    const quarantined = entries.filter(entry => entry.bankStatus === 'quarantined').length;
    const validatedGenerated = entries.filter(entry => entry.bankStatus === 'validated_generated').length;
    const validationFailed = entries.filter(entry => entry.bankStatus === 'validation_failed').length;
    const rejected = entries.filter(entry => entry.bankStatus === 'rejected').length;
    const reviewable = approved + restored + quarantined + validatedGenerated + validationFailed + rejected;
    const scoredEntries = entries.filter(entry => entry.validationScore != null);
    const avgScore = scoredEntries.length > 0
      ? scoredEntries.reduce((sum, e) => sum + (e.validationScore as number), 0) / scoredEntries.length
      : null;
    return {
      total: entries.length,
      legacy: entries.filter(entry => entry.bankStatus === 'legacy').length,
      validatedGenerated,
      approved,
      restored,
      quarantined,
      validationFailed,
      rejected,
      used: entries.filter(entry => entry.usageCount > 0).length,
      totalUsage: entries.reduce((sum, entry) => sum + entry.usageCount, 0),
      approvalRate: reviewable > 0 ? (approved + restored) / reviewable : 0,
      quarantineRate: reviewable > 0 ? quarantined / reviewable : 0,
      averageValidationScore: avgScore,
      averagePendingAgeDays: null,
      generatedLast7d: 0,
    };
  }

  async markUsedByExternalIds(externalIds: string[]): Promise<void> {
    for (const externalId of new Set(externalIds.map(id => String(id || '').trim()).filter(Boolean))) {
      const entry = this.store.get(externalId);
      if (!entry) continue;
      this.store.set(externalId, {
        ...entry,
        usageCount: entry.usageCount + 1,
        lastUsedAt: new Date(),
      });
    }
  }

  async getQuestionsByConcept(concept: string, limit = 500): Promise<Record<string, unknown>[]> {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 500));
    return [...this.store.entries()]
      .filter(([, entry]) => {
        if (entry.source !== 'ai') return false;
        const concepts = entry.body['canonicalConcepts'];
        return Array.isArray(concepts) && concepts.includes(concept);
      })
      .slice(0, safeLimit)
      .map(([externalId, entry]) => this.enrichEntry(externalId, entry));
  }

  async getConceptCoverage(): Promise<Array<{ concept: string; count: number }>> {
    const counts = new Map<string, number>();
    for (const entry of this.store.values()) {
      if (entry.source !== 'ai') continue;
      const concepts = entry.body['canonicalConcepts'];
      if (!Array.isArray(concepts)) continue;
      for (const c of concepts) {
        if (typeof c !== 'string' || !c) continue;
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 500)
      .map(([concept, count]) => ({ concept, count }));
  }

  private entryFingerprint(body: Record<string, unknown>): string {
    return computeQuestionFingerprint(body['stem'], body['testedConcept']);
  }

  private sanitizeOptions(body: Record<string, unknown>): Array<{ letter: string; text: string }> {
    const raw = Array.isArray(body['options']) ? (body['options'] as Array<Record<string, unknown>>) : [];
    return raw.map((opt) => ({ letter: String(opt?.['letter'] ?? ''), text: String(opt?.['text'] ?? '') }));
  }

  async findStudentCatalog(params: {
    page?: number;
    limit?: number;
    subject?: string;
    system?: string;
    difficulty?: string;
    mode?: string;
    search?: string;
    excludeFingerprints?: string[];
  }): Promise<PaginatedResult<CatalogQuestion>> {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
    const excluded = new Set(params.excludeFingerprints ?? []);
    const needle = params.search?.trim().toLowerCase() ?? '';

    const entries = [...this.store.entries()].filter(([, e]) => {
      if (e.source !== 'authored') return false;
      if (!['approved', 'restored'].includes(e.bankStatus)) return false;
      if (params.subject?.trim() && e.subject !== params.subject.trim()) return false;
      if (params.system?.trim() && e.system !== params.system.trim()) return false;
      if (params.difficulty?.trim() && e.difficulty !== params.difficulty.trim()) return false;
      if (params.mode?.trim() && e.mode !== params.mode.trim()) return false;
      // 'restored' rows are exempt from the fingerprint exclusion — see PgQuestionsRepository.
      if (e.bankStatus !== 'restored' && excluded.has(this.entryFingerprint(e.body))) return false;
      if (needle) {
        const haystack = [e.body['stem'], e.body['testedConcept'], e.body['topic'], e.subject, e.system]
          .map((v) => String(v ?? '').toLowerCase());
        if (!haystack.some((v) => v.includes(needle))) return false;
      }
      return true;
    });

    // Stable, deterministic order so pagination never skips/duplicates a row —
    // the in-memory repo has no createdAt to mirror PG's ORDER BY exactly, so it
    // sorts by external_id instead (still consistent across pages).
    entries.sort(([aId], [bId]) => aId.localeCompare(bId));

    const total = entries.length;
    const slice = entries.slice((page - 1) * limit, page * limit);

    const data: CatalogQuestion[] = slice.map(([externalId, e]) => ({
      id: externalId,
      subject: e.subject,
      system: e.system,
      difficulty: e.difficulty,
      mode: e.mode,
      topic: typeof e.body['topic'] === 'string' ? e.body['topic'] : null,
      testedConcept: typeof e.body['testedConcept'] === 'string' ? e.body['testedConcept'] : null,
      stem: typeof e.body['stem'] === 'string' ? e.body['stem'] : null,
      options: this.sanitizeOptions(e.body),
      reviewMetadata: this.enrichEntry(externalId, e).reviewMetadata as Record<string, unknown>,
      commercialReady: Boolean(this.enrichEntry(externalId, e).commercialReady),
    }));

    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async findByExternalIds(
    ids: string[],
    excludeFingerprints: string[] = [],
  ): Promise<Array<{ id: string; body: Record<string, unknown> }>> {
    if (ids.length === 0) return [];
    const safe = [...new Set(ids.map(id => String(id || '').trim()).filter(Boolean))];
    const excluded = new Set(excludeFingerprints);
    return safe.flatMap(externalId => {
      const e = this.store.get(externalId);
      if (!e || e.source !== 'authored' || !['approved', 'restored'].includes(e.bankStatus)) return [];
      if (e.bankStatus !== 'restored' && excluded.has(this.entryFingerprint(e.body))) return [];
      return [{ id: externalId, body: this.enrichEntry(externalId, e).body as Record<string, unknown> }];
    });
  }

  _getEntry(externalId: string): { id: string; subject: string; system: string; body: Record<string, unknown>; usageCount?: number; lastUsedAt?: Date | null } | undefined {
    return this.store.get(externalId);
  }
}
