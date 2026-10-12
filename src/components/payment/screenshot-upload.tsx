"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ImageIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { MAX_PAYMENT_SCREENSHOT_BYTES } from "@/lib/payment-screenshot";

/**
 * File picker for the optional payment screenshot. Reads the file to bytes
 * in the browser and surfaces them via `onChange(bytes | null)`. The parent
 * (booking form) passes them into `submitBookingRequest`. The server is the
 * one that actually validates — this is purely for a friendly UX (a quick
 * size check and a thumbnail preview).
 */
export function ScreenshotUpload({
  onChange,
}: {
  onChange: (bytes: Uint8Array | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clear() {
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
    setName(null);
    setError(null);
    onChange(null);
  }

  async function pick(file: File | null) {
    if (!file) return;
    if (file.size > MAX_PAYMENT_SCREENSHOT_BYTES) {
      setError(`That file is larger than ${MAX_PAYMENT_SCREENSHOT_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please pick an image file (PNG, JPEG, or WebP).");
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    setError(null);
    setName(file.name);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return URL.createObjectURL(file);
    });
    onChange(bytes);
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <ImageIcon className="h-4 w-4" />
        Payment screenshot <span className="text-xs font-normal text-slate-400">(optional)</span>
      </label>

      {preview ? (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Payment screenshot preview"
            className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{name ?? "screenshot"}</p>
            <p className="mt-0.5 text-xs text-slate-500">Will be attached to your booking request.</p>
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
          )}
        >
          <UploadIcon className="h-4 w-4" />
          <span>Tap to upload a screenshot</span>
          <span className="text-xs text-slate-400">(PNG, JPEG, WebP — up to 2 MB)</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="sr-only"
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