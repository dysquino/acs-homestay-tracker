/**
 * Browser-side image compression for guest uploads (payment screenshots and
 * ID photos). The home-stay DB lives on Neon's free tier (512 MB) and we'd
 * rather not eat 4-8 MB per phone photo when 200-300 KB keeps everything
 * legible. So before the bytes ever leave the device we:
 *
 *  1. Drop the long edge to MAX_EDGE_PX (1600). For a text-heavy image
 *     (a payment receipt, a name on an ID) 1600 px is comfortably above
 *     the legibility threshold, and 4000-px phone shots compress to
 *     almost nothing.
 *  2. Re-encode as JPEG at quality JPEG_QUALITY (0.9). 0.9 is visually
 *     lossless for photos and keeps small text sharp — at 0.7 you start
 *     seeing ringing around glyphs.
 *  3. Use canvas, which strips EXIF (including GPS coordinates) as a free
 *     privacy side-effect.
 *
 * The pure helpers (`computeTargetDimensions`, `pickOutputMime`) are
 * unit-tested in `__tests__/image-compress.test.ts`; the browser-only
 * `compressImageInBrowser` is verified manually in dev since it depends on
 * the browser's Image/canvas — Vitest runs in Node.
 */

export const MAX_EDGE_PX = 1600;
export const JPEG_QUALITY = 0.9;

/**
 * Long-edge scaling: shrink the longer side to `maxEdge` (preserve aspect),
 * and only ever shrink (never upscale a small image).
 */
export function computeTargetDimensions(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE_PX,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width, height };
  }
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * Decide the output MIME. We standardize on JPEG: it beats PNG by 5-10x for
 * photos and is fine for text at JPEG_QUALITY 0.9. The input MIME is kept
 * in the signature so callers can log/branch on it later without breaking
 * the API; today we ignore it and always return image/jpeg.
 */
export function pickOutputMime(inputMime: string): "image/jpeg" {
  // Touched only so the parameter doesn't trip @typescript-eslint/no-unused-vars
  // — it's part of the public signature for future evolution.
  void inputMime;
  return "image/jpeg";
}

export type CompressOpts = {
  /** Long-edge cap. Defaults to 1600. */
  maxEdge?: number;
  /** JPEG quality 0..1. Defaults to 0.9. */
  quality?: number;
};

export type CompressResult = {
  bytes: Uint8Array;
  mime: "image/jpeg";
  originalBytes: number;
  originalMime: string;
  width: number;
  height: number;
};

/**
 * Browser-only: read a `File`/`Blob`, decode it into an Image, draw onto a
 * canvas at the target dimensions, and re-encode as JPEG. Throws on a
 * non-image, an undecodable format (e.g. HEIC on a desktop that doesn't
 * ship a codec), or a canvas read failure.
 */
export async function compressImageInBrowser(
  file: File | Blob,
  opts: CompressOpts = {},
): Promise<CompressResult> {
  if (typeof window === "undefined") {
    throw new Error("compressImageInBrowser must be called in a browser environment.");
  }
  const maxEdge = opts.maxEdge ?? MAX_EDGE_PX;
  const quality = opts.quality ?? JPEG_QUALITY;

  const inputMime = (file as File).type || "application/octet-stream";
  if (!inputMime.startsWith("image/")) {
    throw new Error("That file isn't an image.");
  }

  const dataUrl = await blobToDataUrl(file);
  const img = await loadImage(dataUrl);

  const { width, height } = computeTargetDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    maxEdge,
  );

  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare the image for upload — please try again.");
  (ctx as CanvasRenderingContext2D).drawImage(img, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    bytes,
    mime: "image/jpeg",
    originalBytes: file.size,
    originalMime: inputMime,
    width,
    height,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't decode that image. Please try a PNG or JPEG."));
    img.src = src;
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mime: string,
  quality: number,
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: mime, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't encode the image. Please try again."))),
      mime,
      quality,
    );
  });
}
