/**
 * A shared secret that is missing is only acceptable on a developer's machine.
 * In production an unconfigured secret means the endpoint is wide open, so we
 * refuse the request instead of accepting it. The site is publicly reachable;
 * anyone could otherwise POST fabricated calls and create leads, or free a
 * booked consultation slot.
 */
export const isProduction = () =>
  process.env.VERCEL_ENV === 'production' || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production');

export type SecretCheck = { ok: true } | { ok: false; status: number; error: string };

export function requireSecret(configured: string, supplied: string | null | undefined, name: string): SecretCheck {
  if (!configured) {
    if (isProduction()) {
      return { ok: false, status: 503, error: `${name} is not configured on this deployment` };
    }
    return { ok: true }; // local development only
  }
  if (!supplied) return { ok: false, status: 401, error: 'unauthorised' };
  return constantTimeEqual(configured, supplied) ? { ok: true } : { ok: false, status: 401, error: 'unauthorised' };
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
