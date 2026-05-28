import { createApp } from './app.js';
import { config } from './config.js';
import { testDbConnection } from './config/db.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`\n  MEDICA API\n  Running at → http://localhost:${config.port}\n`);

  if (config.databaseUrl) {
    testDbConnection().catch((err: Error) => {
      console.error('  DB ✗ PostgreSQL connection failed:', err.message);
    });
  } else {
    console.log('  DB — running with in-memory repositories (no DATABASE_URL set)');
  }
});
