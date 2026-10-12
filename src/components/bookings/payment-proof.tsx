"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ImageIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import {
  attachBookingRequestScreenshot,
  clearBookingRequestScreenshot,
  getBookingRequestScreenshot,
} from "@/lib/data/payment-screenshot";
import { cn } from "@/lib/cn";
import { MAX_PAYMENT_SCREENSHOT_BYTES } from "@/lib/payment-screenshot";

/**
 * The "Payment proof" area on a pending booking request card:
 * - If a screenshot is on file: shows a thumbnail and buttons to view full /
 *   replace / remove.
 * - If not: shows an "Attach payment screenshot" button that opens the
 *   upload modal.
 *
 * State (file + viewer URL) is lifted here so the modal's footer button can
 * submit without prop-drilling through the modal body.
 */
export function PaymentProof({
  requestId,
  hasScreenshot,
  onChanged,
}: {
  requestId: string;
  hasScreenshot: boolean;
  /** Called after attach/clear so the parent can re-fetch the requests list. */
  onChanged: () => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastPreviewUrl = useRef<string | null>(null);

  // Revoke any blob URL we created when the picked file changes or the
  // component unmounts.
  useEffect(() => {
    return () => {
      if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
    };
  }, []);

  function clearPicked() {
    setBytes(null);
    if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
    lastPreviewUrl.current = null;
    setPreview(null);
    setError(null);
  }

  function resetAttachModal() {
    clearPicked();
    setBusy(false);
  }

  async function pickFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_PAYMENT_SCREENSHOT_BYTES) {
      setError(`That file is larger than ${MAX_PAYMENT_SCREENSHOT_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please pick an image file (PNG, JPEG, or WebP).");
      return;
    }
    setError(null);
    setBytes(new Uint8Array(await file.arrayBuffer()));
    if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
    const url = URL.createObjectURL(file);
    lastPreviewUrl.current = url;
    setPreview(url);
  }

  async function submitAttach() {
    if (!bytes) {
      setError("Pick a file first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await attachBookingRequestScreenshot(requestId, bytes);
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
    <div className="mt-2 space-y-1.5">
      {hasScreenshot ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setViewerOpen(true)} className="px-2 py-1 text-xs">
            <ImageIcon className="h-3.5 w-3.5" />
            <span className="ml-1">View payment proof</span>
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
          <span className="ml-1">Attach payment screenshot</span>
        </Button>
      )}

      <Modal
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        title="Payment screenshot"
        description="Screenshot uploaded by the guest (or attached by an owner) with this booking request."
        wide
      >
        {viewerOpen ? (
          <ScreenshotViewerBody requestId={requestId} key={requestId} />
        ) : null}
      </Modal>

      <Modal
        open={attachOpen}
        onClose={() => {
          setAttachOpen(false);
          resetAttachModal();
        }}
        title="Attach payment screenshot"
        description="PNG, JPEG, or WebP — up to 2 MB."
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
            )}
          >
            <UploadIcon className="h-4 w-4" />
            <span>Tap to choose a screenshot</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>

          {preview ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">Will be attached to this booking request.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Selected payment screenshot"
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
        if (!confirm("Remove the payment screenshot from this request?")) return;
        setBusy(true);
        try {
          await clearBookingRequestScreenshot(requestId);
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

/** Mounts fresh every time the viewer opens (gated by `key={requestId}` and
 * conditional render above) — its initial state is "loading", so the effect
 * only starts the fetch and updates from the .then. */
function ScreenshotViewerBody({ requestId }: { requestId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getBookingRequestScreenshot(requestId)
      .then((data) => {
        if (!alive) return;
        if (!data) {
          setError("No screenshot attached.");
          return;
        }
        const blob = new Blob([data.bytes as BlobPart], { type: data.mime });
        setSrc(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (alive) setError("Couldn't load the screenshot.");
      });
    return () => {
      alive = false;
    };
  }, [requestId]);

  // Revoke the blob URL we created on unmount.
  useEffect(() => {
    if (!src) return;
    const url = src;
    return () => URL.revokeObjectURL(url);
  }, [src]);

  if (error) return <p className="text-sm text-slate-600">{error}</p>;
  if (src) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={src} alt="Payment screenshot" className="mx-auto max-h-[70vh] w-auto rounded-lg" />;
  }
  return <p className="text-sm text-slate-500">Loading…</p>;
}