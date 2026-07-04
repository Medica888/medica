import type { IQuestionReportsRepository, IQuestionsRepository } from '../repositories/interfaces.js';
import type { CatalogQuestion, PaginatedResult } from '../types/index.js';

const MAX_SESSION_QUESTIONS = 40;

export class QuestionCatalogService {
  constructor(
    private questions: IQuestionsRepository,
    private questionReports: IQuestionReportsRepository,
  ) {}

  async getCatalog(params: {
    page?: number;
    limit?: number;
    subject?: string;
    system?: string;
    difficulty?: string;
    search?: string;
  }): Promise<PaginatedResult<CatalogQuestion>> {
    // Not caught here: a lookup failure must fail the whole request (fail-closed)
    // rather than silently serving the catalog unfiltered.
    const quarantined = await this.questionReports.getQuarantinedFingerprints();
    return this.questions.findStudentCatalog({ ...params, excludeFingerprints: [...quarantined] });
  }

  /**
   * Resolves a QBank selection to full question bodies (with answers).
   * Throws SELECTION_STALE if any id no longer resolves to a safe, authored question —
   * mirrors the local createSelectedQuestionSession contract in mockQuestions.js.
   */
  async createSession(externalIds: string[]): Promise<Array<{ id: string; body: Record<string, unknown> }>> {
    const trimmedIds = externalIds.map((id) => String(id || '').trim()).filter(Boolean);
    if (trimmedIds.length === 0) throw new Error('EMPTY_SELECTION');
    if (trimmedIds.length > MAX_SESSION_QUESTIONS) throw new Error('SELECTION_LIMIT');
    if (new Set(trimmedIds).size !== trimmedIds.length) throw new Error('DUPLICATE_SELECTION');

    // Fail-closed, same as getCatalog: propagate lookup failures instead of swallowing them.
    const quarantined = await this.questionReports.getQuarantinedFingerprints();
    const found = await this.questions.findByExternalIds(trimmedIds, [...quarantined]);
    const byId = new Map(found.map((q) => [q.id, q]));
    if (byId.size !== trimmedIds.length) throw new Error('SELECTION_STALE');

    return trimmedIds.map((id) => byId.get(id)!);
  }
}
