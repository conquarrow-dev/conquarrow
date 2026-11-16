/**
 * Google ID token cached in localStorage (`conquarrow:google-id-token`, P95 D12).
 * The cache only spares a sign-in; the server stays the source of truth.
 *
 * @see docs/spec/online-web/online-web.md
 */

import {
  GOOGLE_ID_TOKEN_SESSION_KEY,
  type OnlinePagesSession,
} from '@conquarrow/contracts';

export { GOOGLE_ID_TOKEN_SESSION_KEY };

export const readSessionToken = (session: OnlinePagesSession): string | undefined => {
  const value = session.getItem(GOOGLE_ID_TOKEN_SESSION_KEY);
  if (value === null || value === '') return undefined;
  return value;
};

export const writeSessionToken = (session: OnlinePagesSession, token: string): void => {
  session.setItem(GOOGLE_ID_TOKEN_SESSION_KEY, token);
};

const base64UrlJson = (segment: string): unknown => {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))) as unknown;
  } catch {
    return undefined;
  }
};

/** P95 D12: the JWT `exp` in epoch milliseconds, or undefined for an opaque token. */
export const tokenExpiryMs = (token: string): number | undefined => {
  const payload = token.split('.')[1];
  if (payload === undefined) return undefined;
  const claims = base64UrlJson(payload);
  if (typeof claims !== 'object' || claims === null) return undefined;
  const exp = (claims as Record<string, unknown>)['exp'];
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : undefined;
};

export const clearSessionToken = (session: OnlinePagesSession): void => {
  session.removeItem(GOOGLE_ID_TOKEN_SESSION_KEY);
};
