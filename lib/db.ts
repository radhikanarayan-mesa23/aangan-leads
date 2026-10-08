import { Pool, type QueryResultRow } from 'pg';
import { env } from './env';

// ASSUME: a single Postgres connection string (DATABASE_URL) for both Neon and
// Supabase. Neon's pooled endpoint and Supabase's pooler both speak plain
// Postgres, so nothing above this file knows which one is behind it.
declare global {
  // eslint-disable-next-line no-var
  var __aanganPool: Pool | undefined;
}

export function pool(): Pool {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!global.__aanganPool) {
    global.__aanganPool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(env.DATABASE_URL) ? undefined : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return global.__aanganPool;
}

export async function sql<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool().query<T>(text, params as never[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await sql<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (q: typeof sql) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    const q = (async (text: string, params: unknown[] = []) =>
      (await client.query(text, params as never[])).rows) as typeof sql;
    const out = await fn(q);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
