import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool } from './db.js';
import { config } from './config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_CHARACTER_IDS = [
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000004'
];

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [746361]);
    await client.query(await readFile(resolve(root, 'db/schema.sql'), 'utf8'));
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("INSERT INTO schema_migrations(version) VALUES('001_initial') ON CONFLICT DO NOTHING");
    if (config.seedDemo) await client.query(await readFile(resolve(root, 'db/seed.sql'), 'utf8'));

    // The repository used to ship with demo heroes. They must not become
    // real player characters after deployment or after a database restart.
    // Keep the campaign/world seed, but always start the roster empty.
    await client.query('DELETE FROM characters WHERE id = ANY($1::uuid[])', [DEMO_CHARACTER_IDS]);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [746361]).catch(() => {});
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().then(() => pool.end()).catch((error) => { console.error(error); process.exit(1); });
}
