import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:123456789@localhost:5432/fintax_db?schema=public';

export const pool = new Pool({
  connectionString,
  max: 25,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // Generous timeout to avoid contention under high startup load
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
    try {
      await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS expiry_date VARCHAR(50);');
      await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS expiry_status VARCHAR(50);');
    } catch {
      // ignore if already exists or permission
    }
    return true;
  } catch (error: any) {
    console.warn('[PostgreSQL] Not connected — running with in-memory fallback users.');
    return false;
  }
}
