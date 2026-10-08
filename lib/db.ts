import { Pool, type QueryResultRow } from 'pg';
import { env } from './env';

// Neon (decided 2026-10-08, docs/DECISIONS.md). Plain Postgres over `pg`, so
// nothing above this file knows which host is behind DATABASE_URL.
//
// Use Neon's **pooled** endpoint — the host with `-pooler` in it. Serverless
// functions open a connection per invocation, and the direct endpoint runs out
// of them under any real traffic.
declare global {
  // eslint-disable-next-line no-var
  var __aanganPool: Pool | undefined;
}

export function pool(): Pool {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!global.__aanganPool) {
    global.__aanganPool = new Pool({
      connectionString: env.DATABASE_URL,
      // Neon presents a valid certificate, so verify it. Only a local database
      // runs unencrypted, and `sslmode=no-verify` is the explicit opt-out for a
      // host with a self-signed cert.
      ssl: isLocal(env.DATABASE_URL)
        ? undefined
        : { rejectUnauthorized: !/sslmode=no-verify/.test(env.DATABASE_URL) },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return global.__aanganPool;
}

const isLocal = (url: string) => /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

/**
 * Test seam. `scripts/verify-db.ts` points this at an embedded Postgres so the
 * real queries in lib/ run unchanged, with no server and no network.
 */
type Executor = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;
let executor: Executor | null = null;
export function setExecutor(fn: Executor | null) {
  executor = fn;
}

export async function sql<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  if (executor) return (await executor(text, params)) as T[];
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
  if (executor) return fn(sql);
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
