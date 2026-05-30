import type { QuestionConcept } from '../../types/index.js';
import type { IQuestionConceptsRepository } from '../interfaces.js';

export class InMemoryQuestionConceptsRepository implements IQuestionConceptsRepository {
  // Key: "questionId:conceptId"
  private store = new Map<string, QuestionConcept>();

  async linkMany(
    links: { questionId: string; conceptId: string; weight: number }[],
    _tx?: unknown,
  ): Promise<void> {
    for (const l of links) {
      const key = `${l.questionId}:${l.conceptId}`;
      this.store.set(key, {
        question_id: l.questionId,
        concept_id:  l.conceptId,
        weight:      l.weight,
      });
    }
  }

  async findByQuestionId(questionId: string, _tx?: unknown): Promise<QuestionConcept[]> {
    return [...this.store.values()].filter((qc) => qc.question_id === questionId);
  }

  async findByConceptId(conceptId: string): Promise<QuestionConcept[]> {
    return [...this.store.values()].filter((qc) => qc.concept_id === conceptId);
  }

  _getAll(): QuestionConcept[] {
    return [...this.store.values()];
  }

  _clear(): void {
    this.store.clear();
  }
}
