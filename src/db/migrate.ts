import path from 'path';

export async function runMigrations(databaseUrl: string): Promise<void> {
  const { runner } = await import('node-pg-migrate');
  await runner({
    databaseUrl,
    dir: path.join(__dirname, 'migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: console.log,
  });
}

// Allow running as standalone script: `tsx src/db/migrate.ts`
if (require.main === module) {
  // Load .env when running standalone
  require('dotenv/config');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL environment variable');
    process.exit(1);
  }

  runMigrations(databaseUrl)
    .then(() => {
      console.log('Migrations complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
