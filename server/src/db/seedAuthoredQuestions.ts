import { readFileSync } from 'fs';
import { join } from 'path';
import type { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

import { config } from '../config.js';
import { getPool } from '../config/db.js';
import { computeQuestionFingerprint } from '../lib/questionFingerprint.js';
import { logger } from '../lib/logger.js';
import {
  mergeReviewedContentMetadataIntoBody,
  normalizeReviewedContentMetadata,
} from '../lib/reviewedContentMetadata.js';

export interface AuthoredQuestion {
  id: string;
  subject?: string;
  system?: string;
  difficulty?: string;
  stem?: string;
  testedConcept?: string;
  [key: string]: unknown;
}

export interface SeedUpsertResult {
  inserted: number;
  updated: number;
  /** Rows the ON CONFLICT WHERE clause left untouched (frozen: quarantined/rejected/etc). */
  skipped: number;
}

/**
 * A reseed must never undo a review decision made through the admin queue, or an approved
 * question would silently drop out of the student catalog on the next deploy. Review
 * metadata is only taken from the seed file while the stored row is still unreviewed or
 * validator-passed; once a reviewer has acted on it, the stored metadata (and the copy
 * mirrored into body) wins. Question content still updates from the seed file.
 */
const KEEP_HUMAN_REVIEW = `COALESCE(questions.review_metadata->>'reviewStatus', 'unreviewed') NOT IN ('unreviewed', 'validator_passed')`;

/**
 * Batched upsert of authored questions (single unnest statement — see CLAUDE.md
 * "Batch inserts — use unnest, never loop"). The ON CONFLICT WHERE clause makes this
 * safe to re-run at any time:
 *   - never touches a row whose source isn't already 'authored' or the pre-migration
 *     'unknown' default, so an external_id collision can never convert a non-authored
 *     (e.g. AI-generated) row into authored content;
 *   - never touches (status OR content) a row currently quarantined/rejected/
 *     validation_failed/restored — those are frozen pending explicit admin review via
 *     the governance endpoints, so a reseed can't silently resurrect or overwrite them.
 *
 * A frozen row satisfies ON CONFLICT but fails the WHERE clause, so Postgres treats it
 * as DO NOTHING for that row — it doesn't error, but it's also absent from RETURNING.
 * `rows.length - res.rowCount` recovers that skipped count; `xmax = 0` distinguishes a
 * fresh insert from an update within what RETURNING did report.
 */
export async function upsertAuthoredQuestions(pool: Pool, questions: AuthoredQuestion[]): Promise<SeedUpsertResult> {
  const rows = questions.filter((q) => String(q?.id || '').trim());
  if (rows.length === 0) return { inserted: 0, updated: 0, skipped: 0 };

  const externalIds  = rows.map((q) => String(q.id).trim());
  const subjects      = rows.map((q) => String(q.subject || ''));
  const systems        = rows.map((q) => String(q.system || ''));
  const difficulties   = rows.map((q) => String(q.difficulty || 'Balanced'));
  const fingerprints   = rows.map((q) => computeQuestionFingerprint(q.stem, q.testedConcept));
  const reviewMetadata = rows.map((q) => normalizeReviewedContentMetadata(q.reviewMetadata, {
    bankStatus: 'approved',
    source: 'authored',
    body: q,
  }));
  const bodies         = rows.map((q, index) => JSON.stringify(
    mergeReviewedContentMetadataIntoBody(q, reviewMetadata[index]),
  ));
  const reviewMetadataJson = reviewMetadata.map((metadata) => JSON.stringify(metadata));

  const res = await pool.query<{ inserted: boolean }>(
    `INSERT INTO questions (external_id, subject, system, body, source, bank_status, mode, difficulty, fingerprint, review_metadata)
     SELECT unnest($1::text[]), unnest($2::text[]), unnest($3::text[]), unnest($4::jsonb[]),
            'authored', 'approved', '', unnest($5::text[]), unnest($6::text[]), unnest($7::jsonb[])
     ON CONFLICT (external_id) DO UPDATE
       SET subject     = EXCLUDED.subject,
           system      = EXCLUDED.system,
           body        = CASE WHEN ${KEEP_HUMAN_REVIEW}
                              THEN EXCLUDED.body || jsonb_build_object(
                                     'reviewMetadata', questions.review_metadata,
                                     'reviewStatus',   questions.review_metadata->>'reviewStatus',
                                     'sourceRefs',     COALESCE(questions.review_metadata->'sourceRefs', '[]'::jsonb))
                              ELSE EXCLUDED.body END,
           source      = EXCLUDED.source,
           bank_status = EXCLUDED.bank_status,
           mode        = EXCLUDED.mode,
           difficulty  = EXCLUDED.difficulty,
           fingerprint = EXCLUDED.fingerprint,
           review_metadata = CASE WHEN ${KEEP_HUMAN_REVIEW} THEN questions.review_metadata ELSE EXCLUDED.review_metadata END
     WHERE questions.source IN ('authored', 'unknown')
       AND questions.bank_status NOT IN ('quarantined', 'rejected', 'validation_failed', 'restored')
     RETURNING (xmax = 0) AS inserted`,
    [externalIds, subjects, systems, bodies, difficulties, fingerprints, reviewMetadataJson],
  );

  const inserted = res.rows.filter((r) => r.inserted).length;
  const updated  = res.rows.length - inserted;
  const skipped  = rows.length - res.rows.length;

  return { inserted, updated, skipped };
}

async function seed(): Promise<void> {
  if (!config.databaseUrl) {
    logger.error('DATABASE_URL is not set. Seeding writes to Postgres and would be lost immediately in-memory.');
    process.exit(1);
  }

  const dataPath = join(__dirname, 'seed-data', 'authoredQuestions.json');
  const questions: AuthoredQuestion[] = JSON.parse(readFileSync(dataPath, 'utf-8'));

  const pool = getPool()!;
  const { inserted, updated, skipped } = await upsertAuthoredQuestions(pool, questions);

  logger.info(`[seed] Authored questions: ${inserted} inserted, ${updated} updated, ${skipped} skipped (frozen).`);
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('[seed] Authored question seed failed', { error: (err as Error).message });
      process.exit(1);
    });
}
