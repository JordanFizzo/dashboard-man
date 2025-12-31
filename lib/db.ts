import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // don't throw here to allow local dev when not configured; functions will handle absence
  console.warn('DATABASE_URL not set - PostgreSQL features will be disabled');
}

const pool = connectionString ? new Pool({ connectionString }) : null;

export async function ensureTables() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id SERIAL PRIMARY KEY,
      uploaded_at TIMESTAMPTZ DEFAULT now(),
      data JSONB
    );
  `);
}

export async function saveUpload(rows: any[]) {
  if (!pool) throw new Error('DATABASE_URL not configured');
  await ensureTables();
  const res = await pool.query('INSERT INTO uploads(data) VALUES($1) RETURNING id, uploaded_at', [rows]);
  return res.rows[0];
}

export async function getLatestUpload() {
  if (!pool) throw new Error('DATABASE_URL not configured');
  await ensureTables();
  const res = await pool.query('SELECT data FROM uploads ORDER BY uploaded_at DESC LIMIT 1');
  return res.rows[0]?.data ?? null;
}

export default pool;
