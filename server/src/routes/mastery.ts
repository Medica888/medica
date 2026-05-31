import { Router } from 'express';
import type { Response } from 'express';
import { MasteryQueryService, masteryTier } from '../services/MasteryQueryService.js';
import { ConceptHierarchyService } from '../services/ConceptHierarchyService.js';
import { AdaptiveExamService } from '../services/AdaptiveExamService.js';
import { AdaptiveFlashcardService } from '../services/AdaptiveFlashcardService.js';
import { StudyPrescriptionService } from '../services/StudyPrescriptionService.js';
import { ProgressTrackingService } from '../services/ProgressTrackingService.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reviewConceptSchema } from '../schemas/mastery.js';
import { getRepositories } from '../repositories/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();

function getService(): MasteryQueryService {
  const { userConceptMastery, concepts } = getRepositories();
  return new MasteryQueryService(userConceptMastery, concepts, new ConceptHierarchyService(concepts));
}

router.use(requireAuth);

router.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getService().getOverview(req.userId!));
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/weakest', async (req: AuthRequest, res: Response) => {
  try {
    const limit       = Math.min(50, Math.max(1, parseInt(String(req.query['limit']        ?? '10'), 10) || 10));
    const minAttempts = Math.max(1,              parseInt(String(req.query['min_attempts'] ?? '2'),  10) || 2);
    const data = await getService().getWeakest(req.userId!, limit, minAttempts);
    res.json({ concepts: data, count: data.length });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/strongest', async (req: AuthRequest, res: Response) => {
  try {
    const limit       = Math.min(50, Math.max(1, parseInt(String(req.query['limit']        ?? '10'), 10) || 10));
    const minAttempts = Math.max(1,              parseInt(String(req.query['min_attempts'] ?? '2'),  10) || 2);
    const data = await getService().getStrongest(req.userId!, limit, minAttempts);
    res.json({ concepts: data, count: data.length });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/adaptive-flashcards-preview', async (req: AuthRequest, res: Response) => {
  try {
    const { userConceptMastery, concepts, masterySnapshots } = getRepositories();
    // Fetch rows once — shared between readiness computation and plan builder
    const rows  = await userConceptMastery.findByUserId(req.userId!);
    const score = await new ProgressTrackingService(userConceptMastery, masterySnapshots)
      .getReadiness(req.userId!, rows);
    const plan = await new AdaptiveFlashcardService(userConceptMastery, concepts)
      .buildAdaptiveFlashcardPlan(req.userId!, score, rows);
    // promptFocusText is server-internal — not exposed to clients
    res.json({
      enabled:              plan.enabled,
      strategy:             plan.strategy,
      reason:               plan.reason,
      weakConcepts:         plan.weakConcepts,
      targetConcepts:       plan.targetConcepts,
      recommendedCardCount: plan.recommendedCardCount,
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/adaptive-preview', async (req: AuthRequest, res: Response) => {
  try {
    const { userConceptMastery, concepts, masterySnapshots } = getRepositories();
    // Fetch rows once — shared between readiness computation and blueprint builder
    const rows  = await userConceptMastery.findByUserId(req.userId!);
    const score = await new ProgressTrackingService(userConceptMastery, masterySnapshots)
      .getReadiness(req.userId!, rows);
    const bp = await new AdaptiveExamService(userConceptMastery, concepts)
      .buildAdaptivePreview(req.userId!, score, rows);
    // Return the client-facing subset — promptFocusText is server-internal
    res.json({
      enabled:        bp.enabled,
      strategy:       bp.strategy,
      reason:         bp.reason,
      weakConcepts:   bp.weakConcepts,
      mediumConcepts: bp.mediumConcepts,
      targetConcepts: bp.targetConcepts,
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/subjects', async (req: AuthRequest, res: Response) => {
  try {
    const subjects = await getService().getSubjectBreakdown(req.userId!);
    res.json({ subjects, count: subjects.length });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/subjects/:subject/concepts', async (req: AuthRequest, res: Response) => {
  const subject = String(req.params['subject']).trim();
  if (!subject) return res.status(400).json({ error: 'Subject is required' });
  try {
    const data = await getService().getConceptsBySubject(req.userId!, subject);
    res.json({ subject, concepts: data, count: data.length });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/prescription', async (req: AuthRequest, res: Response) => {
  try {
    const { userConceptMastery, concepts } = getRepositories();
    const rx = await new StudyPrescriptionService(userConceptMastery, concepts)
      .getPrescription(req.userId!);
    res.json(rx);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/daily-plan', async (req: AuthRequest, res: Response) => {
  try {
    const { userConceptMastery, concepts, masterySnapshots } = getRepositories();
    const rows  = await userConceptMastery.findByUserId(req.userId!);
    const score = await new ProgressTrackingService(userConceptMastery, masterySnapshots)
      .getReadiness(req.userId!, rows);
    const plan = await new StudyPrescriptionService(userConceptMastery, concepts)
      .getDailyPlan(req.userId!, score, rows);
    res.json(plan);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/progress', async (req: AuthRequest, res: Response) => {
  try {
    const { userConceptMastery, masterySnapshots } = getRepositories();
    const svc = new ProgressTrackingService(userConceptMastery, masterySnapshots);
    const [progress, trend] = await Promise.all([
      svc.getProgress(req.userId!),
      svc.getMasteryTrend(req.userId!),
    ]);
    res.json({
      ...progress,
      improvementRate:   svc.getImprovementRate(trend),
      learningVelocity:  svc.getLearningVelocity(trend),
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/timeline', async (req: AuthRequest, res: Response) => {
  try {
    const { userConceptMastery, masterySnapshots } = getRepositories();
    const svc   = new ProgressTrackingService(userConceptMastery, masterySnapshots);
    const trend = await svc.getMasteryTrend(req.userId!);
    const weak  = await svc.getWeakConceptTrend(req.userId!);
    // Add 1-based sessionNumber for frontend chart x-axis labelling
    const trendWithNumbers = trend.map((p, i) => ({ ...p, sessionNumber: i + 1 }));
    const weakWithNumbers  = weak.map((p, i) => ({ ...p, sessionNumber: i + 1 }));
    res.json({
      trend:            trendWithNumbers,
      weakConceptTrend: weakWithNumbers,
      improvementRate:  svc.getImprovementRate(trend),
      learningVelocity: svc.getLearningVelocity(trend),
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/readiness', async (req: AuthRequest, res: Response) => {
  try {
    const { userConceptMastery, masterySnapshots, concepts } = getRepositories();
    const progressSvc     = new ProgressTrackingService(userConceptMastery, masterySnapshots);
    const prescriptionSvc = new StudyPrescriptionService(userConceptMastery, concepts);
    const querySvc        = new MasteryQueryService(userConceptMastery, concepts, new ConceptHierarchyService(concepts));

    // P5: fetch mastery rows once — shared with all downstream service calls
    const rows  = await userConceptMastery.findByUserId(req.userId!);
    // Readiness must resolve first so prescription caps are readiness-aware (P1)
    const score = await progressSvc.getReadiness(req.userId!, rows);
    const [rx, weakest, strongest] = await Promise.all([
      prescriptionSvc.getPrescription(req.userId!, score, rows),
      querySvc.getWeakest(req.userId!,   5, 1, rows),
      querySvc.getStrongest(req.userId!, 5, 1, rows),
    ]);

    res.json({
      overallReadiness:     score.overallReadiness,
      status:               score.status,
      components:           score.components,
      distribution:         score.distribution,
      strongestAreas:       strongest.map(e => ({ name: e.concept.name, masteryScore: e.mastery.mastery_score, tier: e.tier })),
      weakestAreas:         weakest.map(e  => ({ name: e.concept.name,  masteryScore: e.mastery.mastery_score, tier: e.tier })),
      recommendedQuestions: rx.recommendedQuestions,
      recommendedFlashcards: rx.recommendedFlashcards,
      estimatedStudyHours:  Math.ceil(rx.estimatedStudyTime / 60 * 10) / 10,
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/readiness/topic/:id', async (req: AuthRequest, res: Response) => {
  const id = String(req.params['id']);
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Concept not found' });
  try {
    const { userConceptMastery, masterySnapshots, concepts } = getRepositories();
    const progressSvc = new ProgressTrackingService(userConceptMastery, masterySnapshots);
    const [topicScore, conceptDetail] = await Promise.all([
      progressSvc.getTopicReadiness(req.userId!, id),
      new MasteryQueryService(userConceptMastery, concepts, new ConceptHierarchyService(concepts))
        .getConceptDetail(req.userId!, id),
    ]);
    if (!topicScore || !conceptDetail?.concept) {
      return res.status(404).json({ error: 'Concept not found or no mastery data' });
    }
    res.json({ ...topicScore, conceptName: conceptDetail.concept.name });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/concept/:id', async (req: AuthRequest, res: Response) => {
  const id = String(req.params['id']);
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Concept not found' });
  try {
    const data = await getService().getConceptDetail(req.userId!, id);
    if (!data) return res.status(404).json({ error: 'Concept not found' });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/reviews/due', async (req: AuthRequest, res: Response) => {
  try {
    const { userConceptMastery, concepts } = getRepositories();
    const rows = await userConceptMastery.findDueForReview(req.userId!);
    if (!rows.length) return res.json({ reviews: [], total: 0 });

    const conceptMap = new Map(
      (await concepts.findManyById(rows.map((r) => r.concept_id))).map((c) => [c.id, c]),
    );

    const reviews = rows.flatMap((row) => {
      const concept = conceptMap.get(row.concept_id);
      if (!concept) return [];
      return [{
        conceptId:          row.concept_id,
        name:               concept.name,
        subject:            concept.subject,
        priority:           masteryTier(row.mastery_score),
        reviewIntervalDays: row.review_interval_days,
        nextReviewAt:       row.next_review_at?.toISOString() ?? null,
      }];
    });

    res.json({ reviews, total: reviews.length });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/concept/:id/review', validate(reviewConceptSchema), async (req: AuthRequest, res: Response) => {
  const id = String(req.params['id']);
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Concept not found' });
  try {
    const { result } = req.body as { result: 'again' | 'hard' | 'good' | 'easy' };
    const { userConceptMastery } = getRepositories();
    const updated = await userConceptMastery.scheduleReview(req.userId!, id, result);
    if (!updated) return res.status(404).json({ error: 'No mastery record found for this concept' });
    res.json({
      conceptId:         id,
      result,
      reviewIntervalDays: updated.reviewIntervalDays,
      nextReviewAt:      updated.nextReviewAt?.toISOString() ?? null,
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
