"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "./button";

/**
 * A plain centered dialog (a bottom sheet on phones). Closes on Escape or
 * backdrop click, locks body scroll while open. Deliberately not a full
 * focus-trap implementation — enough for the handful of forms in this app.
 *
 * Never taller than the screen: only the body scrolls, so the title/close
 * button and the footer's actions always stay in view. (Letting the whole
 * dialog overflow a bottom-anchored sheet pushed its top off-screen, out of
 * reach of scrolling.)
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /**
   * Whether a backdrop click closes the dialog. Escape and the close button
   * always work — `dismissible: false` only means "don't let a stray click on
   * the page behind throw away work". A multi-step wizard is the case: someone
   * tapping outside a long form is far more likely to be reaching for scroll
   * than to mean "discard this".
   */
  dismissible?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  // A modal may be opened from inside another modal (for example, recording an
  // expense payout from its detail sheet). Portalling to `body` keeps `fixed`
  // positioning relative to the viewport and prevents the parent dialog's
  // scroll/stacking context from clipping or offsetting the child on desktop.
  return createPortal(
    <div
      // `print-root` so a dialog prints as normal document flow rather than a
      // viewport-height overlay that clips everything below the fold.
      className="print-root fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <header className="print-keep flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            // A close button is never useful on paper.
            className="no-print -mr-1.5 -mt-0.5 text-lg leading-none"
          >
            ×
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

        {footer ? (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 rounded-none border-t border-slate-200 bg-slate-50 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-xl">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}
