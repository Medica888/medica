import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { Concept } from '../../types/index.js';
import type { IConceptsRepository } from '../interfaces.js';

interface ConceptRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  subject: string;
  system: string;
  parent_concept_id: string | null;
  difficulty: string;
  description: string;
  created_at: Date;
  updated_at: Date;
}

function toConcept(row: ConceptRow): Concept {
  return {
    id:                row.id,
    name:              row.name,
    slug:              row.slug,
    subject:           row.subject,
    system:            row.system,
    parent_concept_id: row.parent_concept_id ?? undefined,
    difficulty:        row.difficulty,
    description:       row.description,
    created_at:        row.created_at,
    updated_at:        row.updated_at,
  };
}

export class PgConceptsRepository implements IConceptsRepository {
  constructor(private pool: Pool) {}

  async upsertBySlug(
    slug: string,
    data: {
      name: string;
      subject: string;
      system: string;
      description?: string;
      parent_concept_id?: string;
    },
    tx?: unknown,
  ): Promise<Concept> {
    const q = (tx as PoolClient | undefined) ?? this.pool;
    const res = await q.query<ConceptRow>(
      // On conflict:
      //   name / updated_at   always updated
      //   subject / system    first-wins (kept if existing row already has them)
      //   parent_concept_id   set when EXCLUDED value is non-null; else keep existing
      `INSERT INTO concepts (name, slug, subject, system, description, parent_concept_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE
         SET name              = EXCLUDED.name,
             updated_at        = NOW(),
             parent_concept_id = COALESCE(EXCLUDED.parent_concept_id, concepts.parent_concept_id)
       RETURNING *`,
      [
        data.name,
        slug,
        data.subject,
        data.system,
        data.description ?? '',
        data.parent_concept_id ?? null,
      ],
    );
    return toConcept(res.rows[0]!);
  }

  async findBySlug(slug: string): Promise<Concept | null> {
    const res = await this.pool.query<ConceptRow>(
      'SELECT * FROM concepts WHERE slug = $1',
      [slug],
    );
    return res.rows[0] ? toConcept(res.rows[0]) : null;
  }

  async findById(id: string): Promise<Concept | null> {
    const res = await this.pool.query<ConceptRow>(
      'SELECT * FROM concepts WHERE id = $1',
      [id],
    );
    return res.rows[0] ? toConcept(res.rows[0]) : null;
  }

  async findAncestors(conceptId: string): Promise<Concept[]> {
    // Walk parent_concept_id upward from the given concept.
    // Seed includes the concept itself; filter it out in the WHERE clause.
    const res = await this.pool.query<ConceptRow>(
      `WITH RECURSIVE ancestor_chain AS (
         SELECT * FROM concepts WHERE id = $1
         UNION ALL
         SELECT c.* FROM concepts c
           JOIN ancestor_chain ac ON ac.parent_concept_id = c.id
       )
       SELECT * FROM ancestor_chain WHERE id <> $1`,
      [conceptId],
    );
    return res.rows.map(toConcept);
  }

  async findDescendants(conceptId: string): Promise<Concept[]> {
    // Seed: direct children. Recurse downward.
    const res = await this.pool.query<ConceptRow>(
      `WITH RECURSIVE descendant_tree AS (
         SELECT * FROM concepts WHERE parent_concept_id = $1
         UNION ALL
         SELECT c.* FROM concepts c
           JOIN descendant_tree dt ON c.parent_concept_id = dt.id
       )
       SELECT * FROM descendant_tree`,
      [conceptId],
    );
    return res.rows.map(toConcept);
  }
}
