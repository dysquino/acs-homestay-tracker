/**
 * Validation for uploaded images (payment screenshots, ID photos). Pure
 * functions — kept out of `data/` so they're unit-testable without a
 * database, and so the same logic can pre-check a file in the browser
 * before it's sent.
 *
 * The browser's `Content-Type` header is *not* trusted: a client can lie
 * about it, attach a `multipart` boundary with an arbitrary MIME, or send
 * raw bytes with no header at all. The bytes themselves are the truth, so
 * we sniff their magic numbers against the real image headers.
 *
 * PNG: 89 50 4E 47 0D 0A 1A 0A
 * JPEG: FF D8 FF (any of the marker bytes — DB/E0..EF/FE are common; we just
 *       require FF D8 FF so the third byte's high bits stay tolerant).
 * WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50 (RIFF....WEBP)
 * HEIC/HEIF isn't included — most phones still export JPEG or HEIF-as-JPEG
 * for sharing, and a rejected image can always be re-saved as JPEG.
 */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB post-compression cap
/** Backward-compatible alias — older imports still resolve. */
export const MAX_PAYMENT_SCREENSHOT_BYTES = MAX_IMAGE_BYTES;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const WEBP_MAGIC = [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50];

type ImageMime = "image/png" | "image/jpeg" | "image/webp";

/**
 * Sniff whether `bytes` is a real PNG / JPEG / WebP. `null` in `bytes` means
 * "any byte allowed" at that offset (used by WebP's RIFF size chunk).
 *
 * Returns the matching MIME type on success; `null` on failure.
 */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= PNG_MAGIC.length && PNG_MAGIC.every((b, i) => b === bytes[i])) {
    return "image/png";
  }
  if (bytes.length >= JPEG_MAGIC.length && JPEG_MAGIC.every((b, i) => b === bytes[i])) {
    return "image/jpeg";
  }
  if (
    bytes.length >= WEBP_MAGIC.length &&
    WEBP_MAGIC.every((b, i) => b === null || b === bytes[i])
  ) {
    return "image/webp";
  }
  return null;
}

export type ImageValidation = { ok: true; mime: ImageMime } | { ok: false; error: string };

/**
 * Validate an image the server is about to store. `bytes` is whatever the
 * client sent; we don't trust the MIME header they put on it. `label` is the
 * human noun used in error messages ("screenshot", "ID photo", ...).
 */
export function validateImage(bytes: Uint8Array, label: string): ImageValidation {
  if (!bytes || bytes.length === 0) {
    return { ok: false, error: `The ${label} is empty.` };
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    const mb = (MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(0);
    return { ok: false, error: `The ${label} is larger than ${mb} MB.` };
  }
  const mime = sniffImageMime(bytes);
  if (!mime) {
    return { ok: false, error: `Please upload a PNG, JPEG, or WebP ${label}.` };
  }
  return { ok: true, mime };
}

/** Validate a payment screenshot. Thin wrapper around `validateImage`. */
export const validatePaymentScreenshot = (bytes: Uint8Array): ImageValidation =>
  validateImage(bytes, "screenshot");

/** Validate an ID photo. Thin wrapper around `validateImage`. */
export const validateIdPhoto = (bytes: Uint8Array): ImageValidation =>
  validateImage(bytes, "ID photo");
