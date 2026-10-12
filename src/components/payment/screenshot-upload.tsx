"use client";

import { ImageUploadField } from "@/components/ui/image-upload-field";

/** Thin wrapper around `ImageUploadField` with screenshot-specific copy. */
export function ScreenshotUpload({
  onChange,
}: {
  onChange: (bytes: Uint8Array | null) => void;
}) {
  return (
    <ImageUploadField
      label="Payment screenshot"
      onChange={onChange}
    />
  );
}
