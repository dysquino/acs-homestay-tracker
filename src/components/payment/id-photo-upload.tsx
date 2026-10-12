"use client";

import { ImageUploadField } from "@/components/ui/image-upload-field";

/**
 * ID photo upload for the booking form. Whether the field is required is
 * driven by the PaymentConfig `idPhotoRequired` flag (set in Settings) —
 * the parent passes `required` here. The server stays permissive either
 * way; gating is purely form-side so old /book versions keep working.
 */
export function IdPhotoUpload({
  onChange,
  required = true,
}: {
  onChange: (bytes: Uint8Array | null) => void;
  required?: boolean;
}) {
  return (
    <ImageUploadField
      label="ID photo"
      required={required}
      hint={
        required
          ? "Required for seamless check-in — a clear photo of any government-issued ID (passport, driver's license, etc.) works. Compressed automatically before upload."
          : "A clear photo of any government-issued ID (passport, driver's license, etc.) makes check-in smoother. Compressed automatically before upload."
      }
      onChange={onChange}
    />
  );
}
