import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Site-wide access gate — NOT per-user authentication.
 *
 * This exists only to keep random internet visitors off the public
 * deployment while `src/lib/auth.tsx` is still a client-side stub (any of
 * the 5 seeded emails + any password gets in). Everyone who knows the one
 * shared SITE_PASSWORD gets past this gate; who they are after that is
 * still whatever the stub login says. Replace this entirely once real
 * Supabase Auth is wired up.
 *
 * If SITE_PASSWORD isn't set the gate is a no-op in local development, but
 * in production it fails CLOSED: a missing variable must never quietly turn
 * into a public site with all the data and the write endpoints exposed.
 */

const COOKIE_NAME = "site_gate";
const GATE_PATH = "/gate";
const TOKEN_INPUT = "granted";

function expectedToken(): string | null {
  const secret = process.env.SITE_PASSWORD;
  if (!secret) return null;
  return createHmac("sha256", secret).update(TOKEN_INPUT).digest("hex");
}

function isValidToken(token: string | undefined, expected: string): boolean {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function proxy(request: NextRequest) {
  const expected = expectedToken();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Access is not configured. Set SITE_PASSWORD in the deployment's environment variables.",
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (isValidToken(cookie, expected)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = GATE_PATH;
  url.search = "";
  url.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!gate|_next/static|_next/image|favicon.ico).*)"],
};
