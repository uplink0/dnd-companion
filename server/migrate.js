import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool } from './db.js';
import { config } from './config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function migrate() {
  await pool.query(await readFile(resolve(root, 'db/schema.sql'), 'utf8'));
  if (config.seedDemo) await pool.query(await readFile(resolve(root, 'db/seed.sql'), 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().then(() => pool.end()).catch((error) => { console.error(error); process.exit(1); });
}
