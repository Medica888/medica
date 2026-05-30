import { createApp } from './app.js';
import { config } from './config.js';
import { validateSchema } from './db/validateSchema.js';

async function bootstrap(): Promise<void> {
  // Fail fast: verify all required migrations are applied before accepting traffic.
  // No-op when DATABASE_URL is unset (in-memory / test mode).
  if (config.databaseUrl) {
    await validateSchema();
  } else {
    console.log('  DB — running with in-memory repositories (no DATABASE_URL set)');
  }

  const app = createApp();

  app.listen(config.port, () => {
    console.log(`\n  MEDICA API\n  Running at → http://localhost:${config.port}\n`);
  });
}

bootstrap().catch((err: Error) => {
  console.error('\n[startup] FATAL —', err.message);
  process.exit(1);
});
