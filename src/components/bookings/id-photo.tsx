"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { IdCardIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { compressImageInBrowser } from "@/lib/image-compress";
import {
  attachBookingRequestIdPhoto,
  clearBookingRequestIdPhoto,
  getBookingRequestIdPhoto,
} from "@/lib/data/id-photo";
import { cn } from "@/lib/cn";

/**
 * The "ID photo" area on a pending booking request card — parallel to
 * `PaymentProof` for the payment screenshot. If an ID is on file it shows
 * thumbnail + view/replace/remove; if not, a single "Attach ID photo"
 * button opens the upload modal. Client-side compression matches the
 * guest-side flow so even an owner re-attach doesn't blow the storage
 * budget.
 */
export function IdPhotoProof({
  requestId,
  hasPhoto,
  onChanged,
}: {
  requestId: string;
  hasPhoto: boolean;
  /** Called after attach/clear so the parent can re-fetch the requests list. */
  onChanged: () => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastPreviewUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
    };
  }, []);

  function resetAttachModal() {
    setBytes(null);
    setName(null);
    if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
    lastPreviewUrl.current = null;
    setPreview(null);
    setError(null);
  }

  async function pickFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please pick an image file (PNG, JPEG, or WebP).");
      return;
    }
    setError(null);
    setName(file.name);
    setBusy(true);
    try {
      const { bytes: compressed } = await compressImageInBrowser(file);
      setBytes(compressed);
      if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
      const url = URL.createObjectURL(new Blob([compressed as BlobPart], { type: "image/jpeg" }));
      lastPreviewUrl.current = url;
      setPreview(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't process that image.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAttach() {
    if (!bytes) {
      setError("Pick a file first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await attachBookingRequestIdPhoto(requestId, bytes);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onChanged();
      setAttachOpen(false);
      resetAttachModal();
    } catch {
      setError("Couldn't upload. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      {hasPhoto ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setViewerOpen(true)} className="px-2 py-1 text-xs">
            <IdCardIcon className="h-3.5 w-3.5" />
            <span className="ml-1">View ID photo</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              resetAttachModal();
              setAttachOpen(true);
            }}
            className="px-2 py-1 text-xs"
          >
            <UploadIcon className="h-3.5 w-3.5" />
            <span className="ml-1">Replace</span>
          </Button>
          <RemoveButton requestId={requestId} onChanged={onChanged} />
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            resetAttachModal();
            setAttachOpen(true);
          }}
          className="px-2 py-1 text-xs"
        >
          <UploadIcon className="h-3.5 w-3.5" />
          <span className="ml-1">Attach ID photo</span>
        </Button>
      )}

      <Modal
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        title="ID photo"
        description="Uploaded by the guest (or attached by an owner) for seamless check-in."
        wide
      >
        {viewerOpen ? <IdPhotoViewerBody requestId={requestId} key={requestId} /> : null}
      </Modal>

      <Modal
        open={attachOpen}
        onClose={() => {
          setAttachOpen(false);
          resetAttachModal();
        }}
        title="Attach ID photo"
        description="PNG, JPEG, or WebP — compressed automatically before upload."
        footer={
          <>
            <Button
              onClick={() => {
                setAttachOpen(false);
                resetAttachModal();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={submitAttach} disabled={!bytes || busy}>
              {busy ? "Uploading…" : "Attach"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label
            className={cn(
              "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50/40",
              busy && "pointer-events-none opacity-60",
            )}
          >
            <UploadIcon className="h-4 w-4" />
            <span>{busy ? "Compressing…" : "Tap to choose a photo"}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="sr-only"
              disabled={busy}
            />
          </label>

          {preview ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">{name} — will be attached to this request.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Selected ID photo"
                className="mx-auto max-h-64 rounded-lg border border-slate-200 bg-slate-50 object-contain"
              />
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function RemoveButton({ requestId, onChanged }: { requestId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        if (!confirm("Remove the ID photo from this request?")) return;
        setBusy(true);
        try {
          await clearBookingRequestIdPhoto(requestId);
          onChanged();
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="px-2 py-1 text-xs text-red-700 hover:text-red-800"
    >
      <TrashIcon className="h-3.5 w-3.5" />
      <span className="ml-1">Remove</span>
    </Button>
  );
}

function IdPhotoViewerBody({ requestId }: { requestId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getBookingRequestIdPhoto(requestId)
      .then((data) => {
        if (!alive) return;
        if (!data) {
          setError("No ID photo attached.");
          return;
        }
        const blob = new Blob([data.bytes as BlobPart], { type: data.mime });
        setSrc(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (alive) setError("Couldn't load the ID photo.");
      });
    return () => {
      alive = false;
    };
  }, [requestId]);

  useEffect(() => {
    if (!src) return;
    const url = src;
    return () => URL.revokeObjectURL(url);
  }, [src]);

  if (error) return <p className="text-sm text-slate-600">{error}</p>;
  if (src) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={src} alt="ID photo" className="mx-auto max-h-[70vh] w-auto rounded-lg" />;
  }
  return <p className="text-sm text-slate-500">Loading…</p>;
}
