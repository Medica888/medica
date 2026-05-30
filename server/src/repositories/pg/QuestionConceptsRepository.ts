import type { Pool, PoolClient } from 'pg';
import type { QuestionConcept } from '../../types/index.js';
import type { IQuestionConceptsRepository } from '../interfaces.js';

export class PgQuestionConceptsRepository implements IQuestionConceptsRepository {
  constructor(private pool: Pool) {}

  async linkMany(
    links: { questionId: string; conceptId: string; weight: number }[],
    tx?: unknown,
  ): Promise<void> {
    if (!links.length) return;
    const q = (tx as PoolClient | undefined) ?? this.pool;
    await q.query(
      `INSERT INTO question_concepts (question_id, concept_id, weight)
       SELECT unnest($1::uuid[]), unnest($2::uuid[]), unnest($3::numeric[])
       ON CONFLICT (question_id, concept_id) DO UPDATE SET weight = EXCLUDED.weight`,
      [
        links.map((l) => l.questionId),
        links.map((l) => l.conceptId),
        links.map((l) => l.weight),
      ],
    );
  }

  async findByQuestionId(questionId: string, tx?: unknown): Promise<QuestionConcept[]> {
    const q = (tx as PoolClient | undefined) ?? this.pool;
    const res = await q.query<QuestionConcept>(
      'SELECT * FROM question_concepts WHERE question_id = $1',
      [questionId],
    );
    return res.rows;
  }

  async findByConceptId(conceptId: string): Promise<QuestionConcept[]> {
    const res = await this.pool.query<QuestionConcept>(
      'SELECT * FROM question_concepts WHERE concept_id = $1',
      [conceptId],
    );
    return res.rows;
  }
}
