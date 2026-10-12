"use client";

import { ImageUploadField } from "@/components/ui/image-upload-field";

/**
 * ID photo upload for the booking form. Required at the form level — guests
 * need an ID for seamless check-in, so the form blocks submission until
 * they've attached one. The server stays permissive (old clients keep
 * working); the gating lives in `booking-request-form.tsx`.
 */
export function IdPhotoUpload({
  onChange,
}: {
  onChange: (bytes: Uint8Array | null) => void;
}) {
  return (
    <ImageUploadField
      label="ID photo"
      required
      hint="Required for seamless check-in — a clear photo of any government-issued ID (passport, driver's license, etc.) works. Compressed automatically before upload."
      onChange={onChange}
    />
  );
}
