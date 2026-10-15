import { describe, expect, it } from "vitest";

import { config } from "../../proxy";

// Next compiles a matcher like "/((?!a|b).*)" to an anchored regex; mirror that.
const gated = (path: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(path));

describe("access gate matcher", () => {
  it("gates the app pages and their data", () => {
    for (const path of ["/", "/bookings", "/expenses", "/cleaning"]) {
      expect(gated(path), path).toBe(true);
    }
  });

  it("leaves the gate page, static files and the brand images open", () => {
    for (const path of [
      "/gate",
      "/_next/static/chunks/app.js",
      "/_next/image",
      "/favicon.ico",
      "/icon.jpg", // the tab icon
      "/acshomestay_logo.jpg", // the logo on the gate page
    ]) {
      expect(gated(path), path).toBe(false);
    }
  });

  it("does not open up other images by accident", () => {
    expect(gated("/other-photo.jpg")).toBe(true);
  });

  it("opens exactly /book (the guests' booking page) — not /bookings or anything under /book", () => {
    expect(gated("/book")).toBe(false);
    for (const path of ["/bookings", "/book/admin", "/booking", "/books"]) {
      expect(gated(path), path).toBe(true);
    }
  });

  it("opens the Airbnb calendar feed path only — not the other API routes", () => {
    expect(gated("/api/calendar/some-key.ics")).toBe(false);
    for (const path of ["/api/export/bookings", "/api/calendar", "/api/calendars/x"]) {
      expect(gated(path), path).toBe(true);
    }
  });

  it("opens the notification schedule endpoint and the service worker only", () => {
    expect(gated("/api/cron/notify")).toBe(false);
    expect(gated("/sw.js")).toBe(false);
    for (const path of ["/api/cron", "/api/crons/x", "/sw.json", "/sw.js/x", "/bookings/sw.js"]) {
      expect(gated(path), path).toBe(true);
    }
  });
});
