import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestionCatalogService } from './QuestionCatalogService.js';
import { InMemoryQuestionsRepository } from '../repositories/memory/QuestionsRepository.js';
import { InMemoryQuestionReportsRepository } from '../repositories/memory/QuestionReportsRepository.js';
import { computeQuestionFingerprint } from '../lib/questionFingerprint.js';

async function seedAuthored(repo: InMemoryQuestionsRepository, externalId: string, stem: string, testedConcept = 'concept') {
  await repo.upsertByExternalId(externalId, {
    subject: 'Cardiology',
    system: 'Cardiovascular',
    body: { stem, testedConcept, options: [{ letter: 'A', text: 'x' }], correct: 'A' },
    source: 'authored',
    bankStatus: 'approved',
  });
}

function makeReportBase(userId: string) {
  return {
    user_id: userId,
    question_id: null,
    reason: 'duplicate' as const,
    source: null,
    mode: null,
    difficulty: null,
    requested_subject: null,
    requested_system: null,
    requested_topic: null,
    actual_subject: null,
    actual_system: null,
    actual_topic: null,
    tested_concept: null,
    usmle_content_area: null,
    physician_task: null,
    stem_preview: null,
  };
}

async function quarantineFingerprint(
  repo: InMemoryQuestionReportsRepository,
  fingerprint: string,
): Promise<void> {
  await repo.create({ ...makeReportBase('reporter-a'), fingerprint });
  await repo.create({ ...makeReportBase('reporter-b'), fingerprint });
}

describe('QuestionCatalogService', () => {
  let repo: InMemoryQuestionsRepository;
  let reportsRepo: InMemoryQuestionReportsRepository;
  let service: QuestionCatalogService;

  beforeEach(() => {
    repo = new InMemoryQuestionsRepository();
    reportsRepo = new InMemoryQuestionReportsRepository();
    service = new QuestionCatalogService(repo, reportsRepo);
  });

  describe('getCatalog', () => {
    it('returns the paginated, student-safe catalog', async () => {
      await seedAuthored(repo, 'q1', 'stem one');
      const result = await service.getCatalog({});
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.stem).toBe('stem one');
    });

    it('forwards filter params to the repository', async () => {
      await seedAuthored(repo, 'q1', 'stem one');
      const result = await service.getCatalog({ subject: 'Neurology' });
      expect(result.data).toHaveLength(0);
    });

    it('excludes cross-user quarantined fingerprints from the catalog', async () => {
      await seedAuthored(repo, 'q1', 'quarantined stem', 'quarantined concept');
      await seedAuthored(repo, 'q2', 'clean stem', 'clean concept');
      const fp = computeQuestionFingerprint('quarantined stem', 'quarantined concept');
      await quarantineFingerprint(reportsRepo, fp);

      const result = await service.getCatalog({});
      expect(result.data.map((q) => q.id)).toEqual(['q2']);
      expect(result.total).toBe(1);
    });

    it('fails closed when the quarantine lookup throws, instead of serving unfiltered data', async () => {
      await seedAuthored(repo, 'q1', 'stem one');
      vi.spyOn(reportsRepo, 'getQuarantinedFingerprints').mockRejectedValue(new Error('db down'));
      await expect(service.getCatalog({})).rejects.toThrow('db down');
    });
  });

  describe('createSession', () => {
    it('throws EMPTY_SELECTION for an empty id list', async () => {
      await expect(service.createSession([])).rejects.toThrow('EMPTY_SELECTION');
    });

    it('throws SELECTION_LIMIT for more than 40 ids', async () => {
      const ids = Array.from({ length: 41 }, (_, i) => `q${i}`);
      await expect(service.createSession(ids)).rejects.toThrow('SELECTION_LIMIT');
    });

    it('throws DUPLICATE_SELECTION for repeated ids instead of silently deduping', async () => {
      await seedAuthored(repo, 'q1', 'stem one');
      await expect(service.createSession(['q1', 'q1'])).rejects.toThrow('DUPLICATE_SELECTION');
    });

    it('throws SELECTION_STALE when an id does not resolve to a safe question', async () => {
      await seedAuthored(repo, 'q1', 'stem one');
      await expect(service.createSession(['q1', 'missing'])).rejects.toThrow('SELECTION_STALE');
    });

    it('throws SELECTION_STALE when a selected question is cross-user quarantined', async () => {
      await seedAuthored(repo, 'q1', 'quarantined stem', 'quarantined concept');
      const fp = computeQuestionFingerprint('quarantined stem', 'quarantined concept');
      await quarantineFingerprint(reportsRepo, fp);

      await expect(service.createSession(['q1'])).rejects.toThrow('SELECTION_STALE');
    });

    it('never returns a partial session — all-or-nothing on quarantine/staleness', async () => {
      await seedAuthored(repo, 'q1', 'clean stem', 'clean concept');
      await seedAuthored(repo, 'q2', 'quarantined stem', 'quarantined concept');
      const fp = computeQuestionFingerprint('quarantined stem', 'quarantined concept');
      await quarantineFingerprint(reportsRepo, fp);

      await expect(service.createSession(['q1', 'q2'])).rejects.toThrow('SELECTION_STALE');
    });

    it('fails closed when the quarantine lookup throws', async () => {
      await seedAuthored(repo, 'q1', 'stem one');
      vi.spyOn(reportsRepo, 'getQuarantinedFingerprints').mockRejectedValue(new Error('db down'));
      await expect(service.createSession(['q1'])).rejects.toThrow('db down');
    });

    it('returns full question bodies in the requested order', async () => {
      await seedAuthored(repo, 'q1', 'stem one');
      await seedAuthored(repo, 'q2', 'stem two');
      const result = await service.createSession(['q2', 'q1']);
      expect(result.map((q) => q.id)).toEqual(['q2', 'q1']);
      expect(result[0]!.body['stem']).toBe('stem two');
    });
  });
});
