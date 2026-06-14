/**
 * dataProvider — thin adapter layer over apiClient + localStorage.
 *
 * When VITE_USE_BACKEND=true all reads/writes go to the TypeScript backend
 * (port 4000). Otherwise the existing localStorage layer is used unchanged.
 *
 * This file never touches question generation — that remains in
 * generateAIQuestions.js / VITE_USE_BACKEND_API.
 */

import * as api from './apiClient.js';
import { getQuestionCorrectLetter, normalizeAnswerLetter } from './answerNormalize.js';
import { normalizeQuestionTaxonomyFields } from './usmleTaxonomy.js';
import {
  saveCompletedSession,
  getSessionHistory,
  appendFlashcards,
  markFlashcardReviewed,
  updateFlashcardStatus,
  getFlashcards,
  clearFlashcards as _storageFlashcards,
} from './storage.js';

const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';

// ── Session persistence ───────────────────────────────────────────────────

/**
 * Save a completed session.
 * results — output of calculatePracticeResults / calculateCoachResults
 * sessionWithAnswers — full session object with questions array and answers dict
 * Written to localStorage first; backend post is best-effort.
 */
export async function saveSession(results, sessionWithAnswers) {
  const questionIds = (sessionWithAnswers?.questions || []).map(q => q.id);
  const mode = results.mode ?? sessionWithAnswers?.mode ?? 'practice';
  saveCompletedSession({ ...results, mode, questionIds });

  if (!USE_BACKEND) return;

  try {
    const questions = sessionWithAnswers?.questions ?? [];
    const answers   = sessionWithAnswers?.answers   ?? {};

    const mapQuestion = (q) => {
      const normalized = normalizeQuestionTaxonomyFields(q);
      return {
        id:               q.id,
        text:             q.stem ?? '',
        options:          (q.options || []).map(o => (typeof o === 'string' ? o : o.text ?? '')),
        correct_answer:   getQuestionCorrectLetter(q),
        explanation:      q.explanation      ?? '',
        subject:          normalized.subject ?? '',
        system:           normalized.system  ?? '',
        difficulty:       q.difficulty       ?? '',
        pearl:            q.pearl            ?? '',
        testedConcept:    q.testedConcept    ?? '',
        weakSpotCategory: q.weakSpotCategory ?? '',
        topic:            q.topic            ?? '',
        canonicalTopic:   q.canonicalTopic   ?? '',
        topicSlug:        q.topicSlug        ?? '',
        topicSource:      q.topicSource      ?? '',
        usmleContentArea: normalized.usmleContentArea ?? '',
        usmleSubdomain:   q.usmleSubdomain   ?? '',
        physicianTask:    normalized.physicianTask    ?? '',
        questionAngle:    q.questionAngle    ?? '',
        commonTrap:       q.commonTrap       ?? '',
        memoryAnchor:     q.memoryAnchor     ?? '',
      };
    };

    const payload = {
      mode,
      questions:         questions.map(mapQuestion),
      answers,
      score:             results.correct    ?? 0,
      percentage:        results.percentage ?? 0,
      medica_score:      results.medicaScore ?? 0,
      readiness_label:   results.readinessLabel ?? '',
      subject_breakdown: _arrayToRecord(results.subjectBreakdown),
      system_breakdown:  _arrayToRecord(results.systemBreakdown),
      missed_questions:  questions
        .filter(q => {
          const ans = answers[q.id];
          if (!ans) return true;
          return normalizeAnswerLetter(ans) !== getQuestionCorrectLetter(q);
        })
        .map(mapQuestion),
      completed_at:      results.completedAt ?? new Date().toISOString(),
      duration_seconds:  sessionWithAnswers?.totalTime ?? 0,
      difficulty:        sessionWithAnswers?.config?.difficulty ?? 'Balanced',
    };
    await api.exams.create(payload);
  } catch (err) {
    console.warn('[dataProvider] Backend session save failed:', err.message);
  }
}

/** Get session history — always from localStorage (analytics engine reads from there). */
export function getSessions() {
  return getSessionHistory();
}

// ── Flashcards ────────────────────────────────────────────────────────────

/**
 * Save flashcards generated after a session.
 * Written to localStorage first; backend is best-effort.
 */
export async function saveFlashcards(cards) {
  const incomingCards = Array.isArray(cards) ? cards : [];
  const beforeKeys = new Set(getFlashcards().map(_flashcardIdentity));
  const added = appendFlashcards(incomingCards);
  const savedCards = getFlashcards().filter((card) => !beforeKeys.has(_flashcardIdentity(card)));
  const result = {
    added,
    skipped: Math.max(incomingCards.length - added, 0),
    total: incomingCards.length,
    backendAttempted: false,
    backendSynced: false,
  };

  if (!USE_BACKEND || !added || !api.getAuthToken?.() || savedCards.length === 0) {
    return result;
  }

  try {
    const mapped = savedCards.map((c) => ({
      source_question_id:     c.sourceQuestionId ?? c.id,
      type:                   c.type ?? 'Recall',
      front:                  c.front,
      back:                   c.back,
      tag:                    c.tag ?? '',
      review_status:          c.reviewStatus ?? 'new',
      subject:                c.subject ?? '',
      system:                 c.system ?? '',
      topic:                  c.topic ?? '',
      canonical_topic:        c.canonicalTopic ?? '',
      topic_slug:             c.topicSlug ?? '',
      source_mode:            c.sourceMode ?? '',
      memory_anchor:          c.memoryAnchor ?? null,
      common_trap:            c.commonTrap ?? null,
      source_pearl:           c.sourcePearl ?? null,
      weak_spot_category:     c.weakSpotCategory ?? '',
      reinforcement_priority: c.reinforcementPriority ?? 'normal',
      review_count:           c.reviewCount ?? 0,
      ease:                   c.ease ?? null,
      last_missed_reason:     c.lastMissedReason ?? null,
    }));
    result.backendAttempted = true;
    await api.flashcards.createMany(mapped);
    result.backendSynced = true;
  } catch (err) {
    console.warn('[dataProvider] Backend flashcard save failed:', err.message);
  }

  return result;
}

export async function setFlashcardStatus(id, status) {
  updateFlashcardStatus(id, status);

  if (!USE_BACKEND) return;
  try {
    await api.flashcards.updateStatus(id, status);
  } catch (err) {
    console.warn('[dataProvider] Backend flashcard status update failed:', err.message);
  }
}

export async function reviewFlashcard(id, ease) {
  markFlashcardReviewed(id, ease);

  if (!USE_BACKEND || !api.getAuthToken?.()) return;
  try {
    await api.flashcards.markReviewed(id);
  } catch (err) {
    console.warn('[dataProvider] Backend flashcard review failed:', err.message);
  }
}

export async function clearFlashcards() {
  _storageFlashcards();

  if (!USE_BACKEND || !api.getAuthToken?.()) return;
  try {
    await api.flashcards.clearAll();
  } catch (err) {
    console.warn('[dataProvider] Backend flashcard clear failed:', err.message);
  }
}

export function getAllFlashcards() {
  return getFlashcards();
}

// ── Analytics (backend-only reads) ───────────────────────────────────────

/**
 * Fetch server-side analytics. Returns null when backend is disabled or
 * the call fails — callers should fall back to the local analyticsEngine.
 */
export async function getBackendAnalytics() {
  if (!USE_BACKEND) return null;
  try {
    return await api.analytics.get();
  } catch (err) {
    console.warn('[dataProvider] Backend analytics fetch failed:', err.message);
    return null;
  }
}

export async function getProgressGains() {
  if (!USE_BACKEND) return null;
  try {
    const { gains } = await api.analytics.progress();
    return gains;
  } catch (err) {
    console.warn('[dataProvider] Backend progress fetch failed:', err.message);
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function _arrayToRecord(arr) {
  if (!arr) return {};
  if (Array.isArray(arr)) {
    return Object.fromEntries(
      arr.map(({ name, ...rest }) => [name, rest]),
    );
  }
  return arr;
}

function _flashcardIdentity(card) {
  const source = card?.sourceQuestionId ?? card?.source_question_id ?? '';
  const tag = card?.tag ?? '';
  const front = (card?.front ?? '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${source}::${tag}::${front}`;
}
