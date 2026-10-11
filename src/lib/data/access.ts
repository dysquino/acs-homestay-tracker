import "server-only";

import { cookies } from "next/headers";

import { COOKIE_NAME, expectedToken, isValidToken } from "@/lib/site-gate";

/**
 * Every server action must call this first. The proxy only guards page
 * loads, but a server action is a plain POST endpoint that Next.js serves on
 * ANY route — including the ones the proxy leaves open (/gate, and the
 * public booking page). Without this check, anyone who lifted an action's ID
 * from the site's JavaScript could call it through an open page and read or
 * change data without the access code. Same rules as the proxy: no
 * SITE_PASSWORD means open in development, closed in production.
 */
export async function requireSiteAccess(): Promise<void> {
  const expected = expectedToken();
  if (!expected) {
    if (process.env.NODE_ENV === "production") throw new Error("Access is not configured.");
    return;
  }
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!isValidToken(token, expected)) throw new Error("Unauthorized");
}
