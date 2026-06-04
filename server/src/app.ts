import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import examsRouter from './routes/exams.js';
import analyticsRouter from './routes/analytics.js';
import flashcardsRouter from './routes/flashcards.js';
import aiRouter from './routes/ai.js';
import masteryRouter from './routes/mastery.js';
import questionReportsRouter from './routes/questionReports.js';

export function createApp(): express.Application {
  const app = express();

  app.use(cors({ origin: config.allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/exams', examsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/flashcards', flashcardsRouter);
  app.use('/api/mastery', masteryRouter);
  app.use('/api/question-reports', questionReportsRouter);
  app.use('/api', aiRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // Global error handler — catches anything thrown from async route handlers
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[error]', err instanceof Error ? err.stack : err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
