import { createApp } from './app.js';
import { config } from './config.js';
import { validateSchema } from './db/validateSchema.js';
import { getRepositories } from './repositories/index.js';
import { taxonomyResolutionService } from './services/TaxonomyResolutionService.js';

async function bootstrap(): Promise<void> {
  // Fail fast: verify all required migrations are applied before accepting traffic.
  // No-op when DATABASE_URL is unset (in-memory / test mode).
  if (config.databaseUrl) {
    await validateSchema();
  } else {
    console.log('  DB — running with in-memory repositories (no DATABASE_URL set)');
  }

  // Pre-load approved taxonomy aliases into the in-memory resolution cache.
  await taxonomyResolutionService.loadApprovedAliases(getRepositories().taxonomyCandidates).catch(err => {
    console.warn('  Taxonomy alias cache — load failed (aliases will be unavailable until next refresh):', (err as Error).message);
  });

  const app = createApp();

  app.listen(config.port, () => {
    console.log(`\n  MEDICA API\n  Running at → http://localhost:${config.port}\n`);
  });
}

bootstrap().catch((err: Error) => {
  console.error('\n[startup] FATAL —', err.message);
  process.exit(1);
});
