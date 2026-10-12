import { describe, expect, it } from "vitest";

import {
  MAX_PAYMENT_SCREENSHOT_BYTES,
  sniffImageMime,
  validatePaymentScreenshot,
} from "../payment-screenshot";

describe("sniffImageMime", () => {
  it("accepts a real PNG header", () => {
    // 89 50 4E 47 0D 0A 1A 0A followed by IHDR chunk bytes (just enough to be a header).
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
    expect(sniffImageMime(png)).toBe("image/png");
  });

  it("accepts a real JPEG header (FF D8 FF)", () => {
    const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(sniffImageMime(jpg)).toBe("image/jpeg");
  });

  it("accepts a real WebP header (RIFF....WEBP)", () => {
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x1a, 0x00, 0x00, 0x00, // file size (any bytes)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(sniffImageMime(webp)).toBe("image/webp");
  });

  it("rejects bytes that claim to be a PNG but aren't", () => {
    // Same length, first byte changed — typical case when somebody renames .exe → .png.
    const fake = Uint8Array.from([0x00, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffImageMime(fake)).toBe(null);
  });

  it("rejects plain text (HTML, SVG, etc.)", () => {
    const html = new TextEncoder().encode("<!doctype html><img src=x>");
    expect(sniffImageMime(html)).toBe(null);

    const svg = new TextEncoder().encode('<?xml version="1.0"?><svg></svg>');
    expect(sniffImageMime(svg)).toBe(null);
  });

  it("rejects empty / too-short bytes", () => {
    expect(sniffImageMime(new Uint8Array(0))).toBe(null);
    expect(sniffImageMime(Uint8Array.from([0x89]))).toBe(null);
    expect(sniffImageMime(Uint8Array.from([0xff, 0xd8]))).toBe(null);
    expect(sniffImageMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46]))).toBe(null);
  });
});

describe("validatePaymentScreenshot", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);

  it("accepts a valid PNG", () => {
    expect(validatePaymentScreenshot(png)).toEqual({ ok: true, mime: "image/png" });
  });

  it("accepts a valid JPEG", () => {
    expect(validatePaymentScreenshot(jpg)).toEqual({ ok: true, mime: "image/jpeg" });
  });

  it("rejects empty bytes", () => {
    const result = validatePaymentScreenshot(new Uint8Array(0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty/i);
  });

  it("rejects bytes over the size cap", () => {
    const big = new Uint8Array(MAX_PAYMENT_SCREENSHOT_BYTES + 1);
    big.set(png, 0); // pretend the start is a PNG
    const result = validatePaymentScreenshot(big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/larger than 2 MB/i);
  });

  it("rejects non-image bytes even if smaller than the cap", () => {
    const text = new TextEncoder().encode("hello world");
    const result = validatePaymentScreenshot(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/PNG, JPEG, or WebP/i);
  });
});