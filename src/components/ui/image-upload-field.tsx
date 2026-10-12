"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { TrashIcon, UploadIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { compressImageInBrowser } from "@/lib/image-compress";

/**
 * A guest-side image upload field with built-in client-side compression.
 * Used for the optional payment screenshot and the required ID photo on
 * the booking form. Always re-encodes to JPEG at 1600 px long edge /
 * quality 0.9, which takes a 4-8 MB phone photo down to ~150-300 KB while
 * keeping text legible — the Postgres column is `bytea` on Neon's free
 * tier, so the savings matter.
 *
 * The component takes care of the whole pipeline: file pick → compress →
 * preview + bytes via `onChange`. The parent never sees the original
 * uncompressed bytes.
 */
export function ImageUploadField({
  label,
  hint,
  required = false,
  onChange,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  /** Fires with the compressed bytes (or `null` when the field is cleared). */
  onChange: (bytes: Uint8Array | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Track the latest blob URL so we can revoke it when the picked file changes.
  const lastPreviewUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
    };
  }, []);

  function clear() {
    if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
    lastPreviewUrl.current = null;
    setPreview(null);
    setName(null);
    setError(null);
    onChange(null);
  }

  async function pick(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please pick an image file (PNG, JPEG, or WebP).");
      return;
    }
    setError(null);
    setBusy(true);
    setName(file.name);
    try {
      const { bytes } = await compressImageInBrowser(file);
      // Swap the preview to a blob URL built from the COMPRESSED bytes, not
      // the original — that's what the server will see, so it's the honest
      // preview.
      const previewBlob = new Blob([bytes as BlobPart], { type: "image/jpeg" });
      if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
      const url = URL.createObjectURL(previewBlob);
      lastPreviewUrl.current = url;
      setPreview(url);
      onChange(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't process that image. Please try another.");
      setName(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-slate-700">
        <span>{label}</span>
        {required ? (
          <span className="text-xs font-normal text-red-600">required</span>
        ) : (
          <span className="text-xs font-normal text-slate-400">(optional)</span>
        )}
      </label>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}

      {preview ? (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Selected image preview"
            className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{name ?? "image"}</p>
            <p className="mt-0.5 text-xs text-slate-500">Compressed for upload.</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clear}
              className="mt-2 px-2 py-1 text-xs text-red-700 hover:text-red-800"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              <span className="ml-1">Remove</span>
            </Button>
          </div>
        </div>
      ) : (
        <label
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50/40",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <UploadIcon className="h-4 w-4" />
          <span>{busy ? "Compressing…" : "Tap to upload"}</span>
          <span className="text-xs text-slate-400">(PNG, JPEG, WebP — compressed automatically)</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="sr-only"
            disabled={busy}
          />
        </label>
      )}

      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
