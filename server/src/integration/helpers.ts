import { Pool } from 'pg';
import { randomUUID } from 'crypto';

export function createTestPool(): Pool {
  const url = process.env.INTEGRATION_DATABASE_URL;
  if (!url) throw new Error('INTEGRATION_DATABASE_URL not set — start Docker and run npm run test:integration');
  return new Pool({ connectionString: url, max: 5 });
}

// Wipes all user-data tables between tests. Does NOT touch pgmigrations.
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE
      users,
      questions,
      concepts,
      generated_bank_audit_log,
      taxonomy_candidates,
      clinician_reviews,
      user_ai_usage
    RESTART IDENTITY CASCADE
  `);
}

export function makeUser(overrides: Partial<{ email: string; name: string; password_hash: string }> = {}) {
  const id = randomUUID();
  return {
    email: `user-${id}@test.com`,
    name: 'Test User',
    password_hash: '$2b$10$aaaabbbbccccddddeeeeffffffff.fakehashedsecret',
    ...overrides,
  };
}

export function makeReport(
  userId: string,
  overrides: Partial<{
    fingerprint: string;
    reason: string;
  }> = {},
) {
  return {
    user_id: userId,
    question_id: null,
    fingerprint: `fp-${randomUUID()}`,
    reason: 'wrong_answer' as const,
    source: 'ai_generated' as const,
    mode: 'practice' as const,
    difficulty: 'Balanced' as const,
    requested_subject: null,
    requested_system: null,
    requested_topic: null,
    actual_subject: null,
    actual_system: null,
    actual_topic: null,
    tested_concept: null,
    usmle_content_area: null,
    physician_task: null,
    stem_preview: 'A 30-year-old presents with...',
    ...overrides,
  };
}
