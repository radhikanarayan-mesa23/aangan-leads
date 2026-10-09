import type { NextRequest } from 'next/server';
import { env } from './env';
import { requireSecret, type SecretCheck } from './webhook-auth';

/** Shared by the two live call tools. Both check x-tool-secret (CLAUDE.md §10). */
export function toolAuth(req: NextRequest): SecretCheck {
  return requireSecret(env.VAANI_TOOL_SECRET, req.headers.get('x-tool-secret'), 'VAANI_TOOL_SECRET');
}
