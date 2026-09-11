import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  connectionTimeoutMillis: config.databaseConnectTimeoutMs,
  statement_timeout: config.databaseStatementTimeoutMs,
  application_name: 'dnd-realm'
});

pool.on('error', (error) => console.error('Неожиданная ошибка PostgreSQL:', error));

export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
