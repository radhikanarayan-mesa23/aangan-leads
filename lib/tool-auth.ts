import type { NextRequest } from 'next/server';
import { env } from './env';

/** Shared by the two live call tools. Both check x-tool-secret (CLAUDE.md §10). */
export function toolAuthorised(req: NextRequest): boolean {
  if (!env.VAANI_TOOL_SECRET) return true; // not configured yet — open in development only
  return req.headers.get('x-tool-secret') === env.VAANI_TOOL_SECRET;
}
