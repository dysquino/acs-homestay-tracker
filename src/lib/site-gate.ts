import { createHmac, timingSafeEqual } from "crypto";

/**
 * The shared-password gate's cookie, shared by the proxy (which guards page
 * loads) and `requireSiteAccess` (which guards every server action — see
 * src/lib/data/access.ts for why both are needed).
 */

export const COOKIE_NAME = "site_gate";
const TOKEN_INPUT = "granted";

/** The cookie value SITE_PASSWORD unlocks, or null when no password is set. */
export function expectedToken(): string | null {
  const secret = process.env.SITE_PASSWORD;
  if (!secret) return null;
  return createHmac("sha256", secret).update(TOKEN_INPUT).digest("hex");
}

export function isValidToken(token: string | undefined, expected: string): boolean {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
