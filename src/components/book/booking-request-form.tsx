"use client";

import { useMemo, useState, useTransition } from "react";

import { PaymentInfo } from "@/components/payment/payment-info";
import { PriceBreakdown, type PricingConfig } from "@/components/payment/price-breakdown";
import { ScreenshotUpload } from "@/components/payment/screenshot-upload";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { BookedRange } from "@/lib/data/availability";
import { submitBookingRequest } from "@/lib/data/booking-requests-public";
import {
  addMonths,
  isSameMonth,
  monthGrid,
  nightCount,
  occupiedNights,
  startOfMonth,
} from "@/lib/dates";
import { formatMonth } from "@/lib/format";
import { MAX_REQUEST_NIGHTS } from "@/lib/validation";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_AHEAD = 12;

const longDate = new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric" });
const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return longDate.format(new Date(y, m - 1, d));
};

/**
 * What a guest fills in on the booking page: tap a check-in day, then a
 * check-out day, on a calendar where taken nights are crossed out (a taken
 * night can still be a check-out day — that's a normal same-day turnover).
 * Sends a request; nothing is booked until the owners approve it.
 */
export function BookingRequestForm({
  linkKey,
  booked,
  today,
  pricing,
}: {
  linkKey: string;
  booked: BookedRange[];
  today: string;
  pricing: PricingConfig;
}) {
  const takenNights = useMemo(
    () => new Set(booked.flatMap((b) => occupiedNights(b.checkIn, b.checkOut))),
    [booked],
  );
  const [month, setMonth] = useState(startOfMonth(today));
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const [guestName, setGuestName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [guestsCount, setGuestsCount] = useState("2");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [screenshot, setScreenshot] = useState<Uint8Array | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const lastMonth = addMonths(startOfMonth(today), MONTHS_AHEAD - 1);
  const rangeIsFree = (from: string, to: string) => occupiedNights(from, to).every((n) => !takenNights.has(n));

  function pick(day: string) {
    setHint(null);
    if (checkIn && !checkOut && day > checkIn) {
      if (!rangeIsFree(checkIn, day)) {
        setHint("Some nights in between are already booked — choose an earlier check-out, or a new check-in.");
        return;
      }
      if (nightCount(checkIn, day) > MAX_REQUEST_NIGHTS) {
        setHint(`Stays can be at most ${MAX_REQUEST_NIGHTS} nights — message us for longer stays.`);
        return;
      }
      setCheckOut(day);
      return;
    }
    if (takenNights.has(day)) {
      setHint("That night is already booked.");
      return;
    }
    setCheckIn(day);
    setCheckOut(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!checkIn || !checkOut) next.dates = "Choose your check-in and check-out dates on the calendar.";
    if (!guestName.trim()) next.guestName = "Please enter your name.";
    if (!contactInfo.trim()) next.contactInfo = "Please enter a phone number or email so we can reach you.";
    const guests = Number(guestsCount);
    if (!Number.isInteger(guests) || guests < 1 || guests > 20) next.guestsCount = "Enter between 1 and 20 guests.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !checkIn || !checkOut) return;

    setSubmitError(null);
    startTransition(async () => {
      try {
        const result = await submitBookingRequest(linkKey, {
          guestName,
          contactInfo,
          checkIn,
          checkOut,
          guestsCount: guests,
          message,
          website,
          paymentScreenshot: screenshot,
        });
        if (result.ok) setSent(true);
        else setSubmitError(result.error);
      } catch {
        setSubmitError("Something went wrong sending your request. Please try again.");
      }
    });
  }

  if (sent && checkIn && checkOut) {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Request sent — thank you!</p>
        <p className="mt-2 text-sm text-slate-600">
          {fmt(checkIn)} → {fmt(checkOut)} · {nightCount(checkIn, checkOut)} night
          {nightCount(checkIn, checkOut) === 1 ? "" : "s"}
        </p>
        <p className="mt-3 text-sm text-slate-500">
          We&apos;ll contact you at <span className="font-medium text-slate-700">{contactInfo.trim()}</span> to
          confirm your booking. Your dates aren&apos;t reserved until we do.
        </p>
      </div>
    );
  }

  const nights = checkIn && checkOut ? nightCount(checkIn, checkOut) : 0;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {/* Calendar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            aria-label="Previous month"
            onClick={() => setMonth(addMonths(month, -1))}
            disabled={month <= startOfMonth(today)}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold text-slate-900" aria-live="polite">
            {formatMonth(month)}
          </h2>
          <Button
            type="button"
            size="sm"
            aria-label="Next month"
            onClick={() => setMonth(addMonths(month, 1))}
            disabled={month >= lastMonth}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-500">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthGrid(month).map((day) => {
            const inMonth = isSameMonth(day, month);
            const past = day < today;
            const taken = takenNights.has(day);
            // A taken night still works as a check-out day (same-day turnover).
            const canCheckOutHere = Boolean(checkIn && !checkOut && day > checkIn && rangeIsFree(checkIn, day));
            const isStart = day === checkIn;
            const isEnd = day === checkOut; // may be a taken night (turnover day)
            const disabled = !inMonth || past || (taken && !canCheckOutHere && !isEnd);
            const inRange = checkIn && checkOut && day > checkIn && day < checkOut;
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => pick(day)}
                aria-pressed={isStart || isEnd}
                aria-label={`${fmt(day)}${taken ? ", booked" : ""}${isStart ? ", check-in" : ""}${isEnd ? ", check-out" : ""}`}
                className={cn(
                  "flex h-10 items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
                  !inMonth && "invisible",
                  past && "text-slate-300",
                  taken && !past && !isEnd && "text-slate-400 line-through decoration-slate-400",
                  !disabled && !isStart && !isEnd && !inRange && "text-slate-900 hover:bg-brand-50",
                  inRange && "bg-brand-100 text-brand-900",
                  (isStart || isEnd) && "bg-brand-700 font-semibold text-white",
                )}
              >
                {Number(day.slice(8, 10))}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-brand-700" /> Your dates
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-slate-400 line-through">12</span> Already booked
          </span>
        </div>

        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm" aria-live="polite">
          {checkIn && checkOut ? (
            <span className="font-medium text-slate-900">
              {fmt(checkIn)} → {fmt(checkOut)} · {nights} night{nights === 1 ? "" : "s"}
            </span>
          ) : checkIn ? (
            <span className="text-slate-700">
              Check-in <span className="font-medium">{fmt(checkIn)}</span> — now tap your check-out day.
            </span>
          ) : (
            <span className="text-slate-500">Tap your check-in day.</span>
          )}
          {hint ? <p className="mt-1 text-xs text-amber-700">{hint}</p> : null}
          {errors.dates ? <p className="mt-1 text-xs text-red-600">{errors.dates}</p> : null}
        </div>
      </section>

      {/* Price breakdown — only renders when at least one rate is set;
          sits between the calendar and the form so the guest sees what
          they're about to commit to before filling out the fields. */}
      <PriceBreakdown pricing={pricing} nights={nights} />

      {/* Details */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <Field label="Your name" required error={errors.guestName}>
          {(id) => (
            <Input id={id} value={guestName} onChange={(e) => setGuestName(e.target.value)} autoComplete="name" maxLength={100} />
          )}
        </Field>
        <Field
          label="Phone number or email"
          required
          error={errors.contactInfo}
          hint="So we can confirm your booking."
        >
          {(id) => (
            <Input
              id={id}
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              autoComplete="tel"
              placeholder="0917 555 0143 or you@example.com"
              maxLength={100}
            />
          )}
        </Field>
        <Field label="Number of guests" required error={errors.guestsCount}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={guestsCount}
              onChange={(e) => setGuestsCount(e.target.value)}
            />
          )}
        </Field>
        <Field label="Message (optional)">
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Arrival time, special requests, questions…"
              maxLength={1000}
            />
          )}
        </Field>

        <ScreenshotUpload onChange={setScreenshot} />

        {/* Honeypot: hidden from people, irresistible to bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
          </label>
        </div>

        {submitError ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {submitError}
          </p>
        ) : null}
      </section>

      {/* InstaPay instructions — at the bottom, after the guest has committed
          to filling out the booking request. The screenshot upload above is
          already optional; the bank details here are for guests who want to
          pay before sending the request. PaymentInfo renders null until the
          owner configures bank details. */}
      <PaymentInfo />

      {/* Submit lives at the very bottom of the form so guests see the bank
          details before they finalize the request. */}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send booking request"}
      </Button>
      <p className="text-center text-xs text-slate-500">
        This is a request, not a confirmed booking — we&apos;ll get back to you.
      </p>
    </form>
  );
}

