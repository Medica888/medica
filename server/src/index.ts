import { createApp } from './app.js';
import { config } from './config.js';
import { validateSchema } from './db/validateSchema.js';
import { getRepositories } from './repositories/index.js';
import { taxonomyResolutionService } from './services/TaxonomyResolutionService.js';
import { closeRedisStore, initRedisStore } from './middleware/rateLimiter.js';
import { getPool } from './config/db.js';
import { logger } from './lib/logger.js';

async function bootstrap(): Promise<void> {
  // Fail fast: verify all required migrations are applied before accepting traffic.
  // No-op when DATABASE_URL is unset (in-memory / test mode).
  if (config.databaseUrl) {
    await validateSchema();
  } else {
    logger.info('DB — running with in-memory repositories (no DATABASE_URL set)');
  }

  // Pre-load approved taxonomy aliases into the in-memory resolution cache.
  await taxonomyResolutionService.loadApprovedAliases(getRepositories().taxonomyCandidates).catch(err => {
    logger.warn('Taxonomy alias cache — load failed (aliases will be unavailable until next refresh)', { error: (err as Error).message });
  });

  // Connect Redis rate-limit store (no-op when REDIS_URL is unset).
  await initRedisStore();

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`MEDICA API running at http://localhost:${config.port}`);
  });

  // Graceful shutdown: stop accepting new connections, wait up to 30s for
  // in-flight requests (AI generations) to complete, then exit.
  const shutdown = (signal: string) => {
    logger.info(`${signal} received — draining`);
    server.close(async () => {
      await Promise.allSettled([
        closeRedisStore().catch((err: Error) =>
          logger.warn('Redis drain error during shutdown', { error: err.message }),
        ),
        getPool()?.end().catch((err: Error) =>
          logger.warn('Pool drain error during shutdown', { error: err.message }),
        ) ?? Promise.resolve(),
      ]);
      logger.info('All connections closed. Exiting.');
      process.exit(0);
    });
    // Force exit if drain takes too long (e.g. hung AI stream).
    setTimeout(() => {
      logger.warn('Drain timeout — forcing exit.');
      process.exit(1);
    }, 30_000).unref();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap().catch((err: Error) => {
  logger.error('[startup] FATAL', { error: err.message });
  process.exit(1);
});
