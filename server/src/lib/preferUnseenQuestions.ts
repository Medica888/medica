interface ExcludeInput {
  questionIds?: string[];
  baseQuestionIds?: string[];
}

/** Ids the client reports as already seen. Tolerates a missing or malformed value. */
export function collectExcludedQuestionIds(exclude: unknown): Set<string> {
  const ids = new Set<string>();
  if (!exclude || typeof exclude !== 'object') return ids;
  const { questionIds, baseQuestionIds } = exclude as ExcludeInput;
  for (const list of [questionIds, baseQuestionIds]) {
    if (!Array.isArray(list)) continue;
    for (const id of list) if (typeof id === 'string' && id) ids.add(id);
  }
  return ids;
}

/**
 * Orders unseen questions before seen ones, preserving relative order within each group.
 * Seen questions are deprioritised, never dropped: a student who has exhausted a scope
 * should repeat questions rather than be refused a session.
 */
export function preferUnseenQuestions<T extends { id?: unknown }>(pool: T[], seenIds: Set<string>): T[] {
  if (seenIds.size === 0) return pool;
  const isSeen = (question: T) => seenIds.has(String(question.id ?? ''));
  return [...pool.filter((q) => !isSeen(q)), ...pool.filter(isSeen)];
}
