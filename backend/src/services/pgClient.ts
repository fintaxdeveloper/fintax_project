import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:123456789@localhost:5432/fintax_db?schema=public';

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000, // Reduced: fail fast if DB is down
});

pool.on('error', (err: any) => {
  // Suppress verbose idle client errors — fallback users handle offline mode
  if (err.code !== 'EACCES' && err.code !== 'ECONNREFUSED') {
    console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
  }
});

export async function testDbConnection(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(`[PostgreSQL] Connected to "${res.rows[0].db_name}" at ${res.rows[0].current_time}`);
    return true;
  } catch (error: any) {
    console.warn('[PostgreSQL] Not connected — running with in-memory fallback users.');
    return false;
  }
}
