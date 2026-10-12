"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { CalendarIcon, WarningIcon } from "@/components/ui/icons";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { PaymentProof } from "@/components/bookings/payment-proof";
import { getBookingLinkPath } from "@/lib/data/booking-requests";
import { nightCount } from "@/lib/dates";
import { formatDateRange } from "@/lib/format";
import { blockAsBooking } from "@/lib/airbnb-ical";
import { findConflicts } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { Booking, BookingRequest } from "@/lib/types";

const sentAt = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Guests' requests from the booking link, waiting for an owner. Approving
 * one creates a Direct booking (payment pending) through the same path as
 * adding one by hand — `onApproved` then opens it so the payout can be
 * filled in. Hidden when there's nothing waiting.
 */
export function BookingRequests({ onApproved }: { onApproved: (booking: Booking) => void }) {
  const { bookingRequests, bookings, airbnbBlocks, approveRequest, declineRequest, resync } = useStore();
  // Requests become direct bookings, so unimported Airbnb reservations count too.
  const taken = [...bookings, ...airbnbBlocks.map(blockAsBooking)];
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDecline, setToDecline] = useState<BookingRequest | null>(null);

  if (bookingRequests.length === 0) return null;

  async function approve(r: BookingRequest) {
    setBusy(r.id);
    setErrors((e) => ({ ...e, [r.id]: "" }));
    try {
      const result = await approveRequest(r.id);
      if (result.ok && result.booking) onApproved(result.booking);
      else if (!result.ok) setErrors((e) => ({ ...e, [r.id]: result.error }));
    } catch {
      setErrors((e) => ({ ...e, [r.id]: "Couldn't approve this request. Please try again." }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-5 ring-2 ring-brand-200">
      <CardHeader
        icon={CalendarIcon}
        title={`Booking requests (${bookingRequests.length})`}
        description="Sent by guests through your booking link. Approving adds a Direct booking — then fill in the payout."
      />
      <ul className="divide-y divide-slate-100">
        {bookingRequests.map((r) => {
          const clashes = findConflicts(taken, r.checkIn, r.checkOut);
          const nights = nightCount(r.checkIn, r.checkOut);
          const contactHref = r.contactInfo.includes("@")
            ? `mailto:${r.contactInfo}`
            : `tel:${r.contactInfo.replace(/[^\d+]/g, "")}`;
          return (
            <li key={r.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{r.guestName}</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {formatDateRange(r.checkIn, r.checkOut)} · {nights} night{nights === 1 ? "" : "s"} ·{" "}
                    {r.guestsCount} guest{r.guestsCount === 1 ? "" : "s"}
                  </p>
                  <a href={contactHref} className="mt-0.5 inline-block text-sm font-medium text-brand-700 hover:underline">
                    {r.contactInfo}
                  </a>
                  {r.message ? (
                    <p className="mt-2 max-w-prose rounded-lg bg-slate-50 px-3 py-2 text-sm whitespace-pre-line text-slate-700">
                      {r.message}
                    </p>
                  ) : null}
                  <PaymentProof
                    requestId={r.id}
                    hasScreenshot={r.hasPaymentScreenshot}
                    onChanged={resync}
                  />
                  <p className="mt-1.5 text-xs text-slate-400">Sent {sentAt.format(new Date(r.createdAt))}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button onClick={() => setToDecline(r)} disabled={busy === r.id}>
                    Decline
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => approve(r)}
                    disabled={busy === r.id || clashes.length > 0}
                  >
                    {busy === r.id ? "Approving…" : "Approve"}
                  </Button>
                </div>
              </div>
              {clashes.length > 0 ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
                  <WarningIcon className="mt-px h-3.5 w-3.5 shrink-0" />
                  These dates now overlap {clashes.map((c) => c.guestName).join(", ")} — they can&apos;t be
                  approved. Decline, or ask the guest for other dates.
                </p>
              ) : null}
              {errors[r.id] ? (
                <p role="alert" className="mt-2 text-xs text-red-700">
                  {errors[r.id]}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={toDecline !== null}
        title="Decline this request?"
        confirmLabel="Decline"
        message={
          toDecline ? (
            <>
              <strong>{toDecline.guestName}</strong> — {formatDateRange(toDecline.checkIn, toDecline.checkOut)}. The
              request is removed from this list. The guest isn&apos;t notified automatically, so let them know.
            </>
          ) : null
        }
        onCancel={() => setToDecline(null)}
        onConfirm={async () => {
          const target = toDecline;
          setToDecline(null);
          if (!target) return;
          try {
            const result = await declineRequest(target.id);
            if (!result.ok) setErrors((e) => ({ ...e, [target.id]: result.error }));
          } catch {
            setErrors((e) => ({ ...e, [target.id]: "Couldn't decline this request. Please try again." }));
          }
        }}
      />
    </Card>
  );
}

/** "Share booking link": shows the private link with a Copy button. */
export function ShareBookingLink() {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "missing" | "copied" | "error">("idle");

  async function show() {
    setOpen(true);
    setState("loading");
    try {
      const path = await getBookingLinkPath();
      if (!path) return setState("missing");
      setLink(`${window.location.origin}${path}`);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      // Clipboard can be blocked (e.g. plain http on a phone) — the field is selectable instead.
      setState("error");
    }
  }

  return (
    <>
      <Button onClick={show}>Share booking link</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Your booking link"
        description="Send this to guests. They can see which nights are free and send you a request."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Close</Button>
            <Button variant="primary" onClick={copy} disabled={!link}>
              {state === "copied" ? "Copied!" : "Copy link"}
            </Button>
          </>
        }
      >
        {state === "loading" ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {state === "missing" ? (
          <p className="text-sm text-slate-700">
            The booking link isn&apos;t set up yet: add a <code>BOOKING_LINK_KEY</code> environment variable (any long
            random text) in Vercel and redeploy.
          </p>
        ) : null}
        {link ? (
          <div className="space-y-3">
            <Field label="Link">
              {(id) => <Input id={id} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />}
            </Field>
            {state === "error" ? (
              <p className="text-xs text-amber-700">Couldn&apos;t copy automatically — select the link above and copy it.</p>
            ) : null}
            <p className="text-xs text-slate-500">
              Anyone with this link can send a request (nothing is booked until you approve). To switch off old links,
              change <code>BOOKING_LINK_KEY</code> in Vercel.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
