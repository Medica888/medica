import type { IConceptsRepository, IQuestionConceptsRepository } from '../repositories/interfaces.js';
import type { Question } from '../types/index.js';

// ── Slug normalization ────────────────────────────────────────────────────────

const GREEK_MAP: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta',
  ε: 'epsilon', μ: 'mu', σ: 'sigma', ω: 'omega',
};

export function slugifyConcept(name: string): string {
  return name
    .toLowerCase()
    .replace(/[αβγδεμσω]/g, (c) => GREEK_MAP[c] ?? c)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

// ── Skip list ─────────────────────────────────────────────────────────────────

const SKIP_SLUGS = new Set([
  '', 'general', 'mixed', 'other', 'all', 'none', 'unknown',
  'usmle', 'step-1', 'step1', 'medical', 'clinical', 'na', 'n-a',
]);

export function isConceptUsable(value: string | undefined): value is string {
  if (!value) return false;
  const s = value.trim();
  const slug = slugifyConcept(s);
  return s.length >= 3 && slug.length >= 2 && !SKIP_SLUGS.has(slug);
}

function isUsable(value: string | undefined): value is string {
  return isConceptUsable(value);
}

// ── Hierarchy depth ───────────────────────────────────────────────────────────

/**
 * Maps a candidate's weight to its depth in the concept tree.
 * Lower depth = closer to root (more general).
 *
 *   0.4 → depth 0  canonicalTopic          (broadest — tree root)
 *   0.6 → depth 1  weakSpotCategory
 *   1.0 → depth 2  testedConcept primary
 *   0.7 → depth 3  testedConcept dash-right (most specific — leaf)
 */
function hierarchyDepth(weight: number): number {
  if (Math.abs(weight - 0.4) < 0.001) return 0;
  if (Math.abs(weight - 0.6) < 0.001) return 1;
  if (Math.abs(weight - 1.0) < 0.001) return 2;
  if (Math.abs(weight - 0.7) < 0.001) return 3;
  return 99;
}

// ── Concept extraction ────────────────────────────────────────────────────────

export interface ConceptCandidate {
  name: string;
  slug: string;
  weight: number;
}

/**
 * Extracts 1–4 concept candidates from question metadata.
 *
 * Weights / roles:
 *   1.00  testedConcept left  (specific concept being tested)
 *   0.70  testedConcept right (sub-aspect from dash format "A — B")
 *   0.60  weakSpotCategory    (broader diagnostic category)
 *   0.40  canonicalTopic      (curriculum topic — most general)
 *
 * subject and system are NOT extracted as concepts — they are
 * discipline labels stored on the concept row for filtering.
 */
export function extractConcepts(q: Pick<Question,
  'testedConcept' | 'weakSpotCategory' | 'canonicalTopic' | 'topic'
>): ConceptCandidate[] {
  const seen = new Set<string>();
  const result: ConceptCandidate[] = [];

  function tryAdd(name: string, weight: number): void {
    if (!isUsable(name)) return;
    const slug = slugifyConcept(name.trim());
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    result.push({ name: name.trim(), slug, weight });
  }

  const tc = q.testedConcept;
  if (tc) {
    const dashIdx = tc.indexOf(' — ');
    if (dashIdx > -1) {
      tryAdd(tc.slice(0, dashIdx).trim(), 1.00);
      tryAdd(tc.slice(dashIdx + 3).trim(), 0.70);
    } else {
      tryAdd(tc, 1.00);
    }
  }

  if (result.length < 4) tryAdd(q.weakSpotCategory ?? '', 0.60);
  if (result.length < 4) tryAdd(q.canonicalTopic ?? '', 0.40);
  if (result.length === 0) tryAdd(q.topic ?? '', 0.40);

  return result.slice(0, 4);
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ConceptMappingService {
  constructor(
    private concepts: IConceptsRepository,
    private questionConcepts: IQuestionConceptsRepository,
  ) {}

  /**
   * Maps a question's metadata to concept nodes and writes question→concept links.
   * Assigns parent_concept_id to establish a linear hierarchy:
   *   canonicalTopic → weakSpotCategory → testedConcept → dash-secondary
   *
   * Runs inside the caller's transaction so the whole session creation is atomic.
   */
  async mapQuestion(q: Question, questionDbId: string, tx?: unknown): Promise<void> {
    const candidates = extractConcepts(q);
    if (!candidates.length) return;

    // Sort root-to-leaf so each concept is upserted after its parent exists
    const ordered = [...candidates].sort(
      (a, b) => hierarchyDepth(a.weight) - hierarchyDepth(b.weight),
    );

    // Upsert each concept in hierarchy order, passing the previous concept as parent
    const upserted: { slug: string; id: string }[] = [];
    for (const candidate of ordered) {
      const parentId = upserted.length > 0
        ? upserted[upserted.length - 1]!.id
        : undefined;

      const concept = await this.concepts.upsertBySlug(
        candidate.slug,
        {
          name:              candidate.name,
          subject:           q.subject ?? '',
          system:            q.system  ?? '',
          parent_concept_id: parentId,
        },
        tx,
      );
      upserted.push({ slug: candidate.slug, id: concept.id });
    }

    // Build question→concept links using original weights (not hierarchy order)
    const idBySlug = new Map(upserted.map(({ slug, id }) => [slug, id]));
    const links = candidates
      .map((c) => {
        const conceptId = idBySlug.get(c.slug);
        return conceptId ? { questionId: questionDbId, conceptId, weight: c.weight } : null;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    await this.questionConcepts.linkMany(links, tx);
  }
}
