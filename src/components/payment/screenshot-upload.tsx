"use client";

import { ImageUploadField } from "@/components/ui/image-upload-field";

/** Thin wrapper around `ImageUploadField` with screenshot-specific copy. */
export function ScreenshotUpload({
  onChange,
  required = false,
}: {
  onChange: (bytes: Uint8Array | null) => void;
  required?: boolean;
}) {
  return (
    <ImageUploadField
      label="Payment screenshot"
      required={required}
      hint={
        required
          ? "Required — upload a screenshot of your InstaPay payment receipt. Compressed automatically before upload."
          : "Optional — if you've already paid via InstaPay, attach a screenshot of the receipt here. Compressed automatically before upload."
      }
      onChange={onChange}
    />
  );
}
