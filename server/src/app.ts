import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { config } from './config.js';
import { createLogger } from './lib/logger.js';
import { csrfProtection } from './middleware/csrf.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import examsRouter from './routes/exams.js';
import analyticsRouter from './routes/analytics.js';
import flashcardsRouter from './routes/flashcards.js';
import aiRouter from './routes/ai.js';
import masteryRouter from './routes/mastery.js';
import questionReportsRouter from './routes/questionReports.js';
import readyRouter from './routes/ready.js';

export function createApp(): express.Application {
  const app = express();

  // Must be first: tells Express how many proxy hops to trust for correct
  // req.ip and rate-limit key derivation. Set TRUST_PROXY=1 behind one reverse proxy.
  app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(cors({ origin: config.allowedOrigins, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(csrfProtection);
  // Attach a per-request correlation ID for log tracing.
  // Available as (req as any).requestId in handlers.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const id = randomUUID();
    (req as any).requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  app.use('/api/health', healthRouter);
  app.use('/api/ready', readyRouter);
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
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const log = createLogger((req as any).requestId);
    log.error('Unhandled route error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
