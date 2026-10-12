import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_NAME, expectedToken, isValidToken } from "./lib/site-gate";

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

const GATE_PATH = "/gate";

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
  // Left open on purpose: the gate page itself, Next's static files, and the
  // brand assets that the public surfaces need to render. The logo is fetched
  // by the image optimizer (which is exempt), but the optimizer then requests
  // the file itself — gating it would hand the optimizer the login page and
  // break the logo on the gate.
  //
  // `book$` is the guests' booking page — exactly /book, not /bookings. It
  // checks its own link key, and every server action checks access itself
  // (src/lib/data/access.ts), so opening the page exposes no data.
  // `qr-code.JPG` is the static InstaPay QR fallback that /book uses when
  // the owner hasn't uploaded an override; without excluding it here, an
  // anonymous guest's browser would get a /gate redirect for the image
  // (breaking the Pay via InstaPay section). The PWA assets
  // (`apple-icon.png`, `/manifest.webmanifest`, `/icons/...`) are needed for
  // the iPhone "Add to Home Screen" flow, which runs against the deployed
  // origin without any gate cookie.
  // `api/calendar/` is the direct-bookings feed Airbnb imports; Airbnb can't
  // log in, so it checks the secret key in its own URL instead.
  matcher: [
    "/((?!gate|book$|api/calendar/|_next/static|_next/image|favicon.ico|icon.jpg|apple-icon.png|manifest.webmanifest|icons/|acshomestay_logo.jpg|qr-code.JPG).*)",
  ],
};
