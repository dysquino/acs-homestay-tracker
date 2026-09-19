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
});
