"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ImageIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { compressImageInBrowser } from "@/lib/image-compress";

import { imageActions, type EntityKind } from "./image-actions";

/**
 * The "Payment proof" area — used on both the pending booking request card
 * and the edit-booking modal. If a screenshot is on file: thumbnail + View /
 * Replace / Remove. If not: a single "Attach payment screenshot" button.
 *
 * State (file + viewer URL) is lifted here so the modal's footer button
 * can submit without prop-drilling through the modal body.
 *
 * Compression: same shared `compressImageInBrowser` (1600 px / JPEG 0.9)
 * the guest-side form uses, so an owner re-attach from a phone photo
 * doesn't blow the storage budget either.
 */
export function PaymentProof({
  requestId,
  bookingId,
  paymentId,
  entityKind = "request",
  hasScreenshot,
  allowRemove = true,
  onChanged,
}: {
  /** Used when `entityKind === "request"` (the default). */
  requestId?: string;
  /** Used when `entityKind === "booking"`. */
  bookingId?: string;
  /** Used when `entityKind === "payment"`. */
  paymentId?: string;
  entityKind?: EntityKind;
  hasScreenshot: boolean;
  /** Payment rows keep their proof as part of the receipt audit trail. */
  allowRemove?: boolean;
  /** Called after attach/clear so the parent can re-fetch the list. */
  onChanged: () => void;
}) {
  const entityId =
    entityKind === "payment" ? paymentId! : entityKind === "booking" ? bookingId! : requestId!;
  const actions = imageActions(entityKind, "screenshot");

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

  function clearPicked() {
    setBytes(null);
    setName(null);
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
    if (!file.type.startsWith("image/")) {
      setError("Please pick an image file (PNG, JPEG, or WebP).");
      return;
    }
    setError(null);
    setName(file.name);
    setBusy(true);
    try {
      const { bytes: compressed } = await compressImageInBrowser(file);
      if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
      const url = URL.createObjectURL(new Blob([compressed as BlobPart], { type: "image/jpeg" }));
      lastPreviewUrl.current = url;
      setPreview(url);
      setBytes(compressed);
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
      const result = await actions.attach(entityId, bytes);
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
          {allowRemove ? (
            <RemoveButton actions={actions} entityId={entityId} onChanged={onChanged} />
          ) : null}
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
        description={
          entityKind === "payment"
            ? "Proof attached to this individual payment."
            : "Screenshot uploaded by the guest (or attached by an owner) with this booking."
        }
        wide
      >
        {viewerOpen ? (
          <ScreenshotViewerBody actions={actions} entityId={entityId} key={entityId} />
        ) : null}
      </Modal>

      <Modal
        open={attachOpen}
        onClose={() => {
          setAttachOpen(false);
          resetAttachModal();
        }}
        title="Attach payment screenshot"
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
            <span>{busy ? "Compressing…" : "Tap to choose a screenshot"}</span>
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
              <p className="text-xs text-slate-500">
                {name} — will be attached to this {entityKind === "payment" ? "payment" : entityKind}.
              </p>
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

function RemoveButton({
  actions,
  entityId,
  onChanged,
}: {
  actions: ReturnType<typeof imageActions>;
  entityId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        if (!confirm("Remove the payment screenshot?")) return;
        setBusy(true);
        try {
          await actions.clear(entityId);
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

function ScreenshotViewerBody({
  actions,
  entityId,
}: {
  actions: ReturnType<typeof imageActions>;
  entityId: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    actions
      .get(entityId)
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
  }, [actions, entityId]);

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
