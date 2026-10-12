"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { getCalendarFeedPath } from "@/lib/data/airbnb";
import { formatDateRange } from "@/lib/format";
import { useStore } from "@/lib/store";

const ago = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/**
 * One tappable bar under the Bookings header: is the Airbnb calendar being
 * read, and how many Airbnb reservations aren't imported yet (they block
 * direct bookings). Tapping it opens the details plus the feed link to paste
 * into Airbnb, so Airbnb closes the direct bookings' and blocked dates too.
 * Kept to one line on a phone: the state and when, with the count as a badge.
 */
export function AirbnbSyncStatus() {
  const { airbnbStatus: status, airbnbBlocks: blocks } = useStore();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<string | null>(null);
  const [feedState, setFeedState] = useState<"idle" | "loading" | "missing" | "copied" | "error">("idle");

  async function openDetails() {
    setOpen(true);
    setFeedState("loading");
    try {
      const path = await getCalendarFeedPath();
      if (!path) return setFeedState("missing");
      setFeed(`${window.location.origin}${path}`);
      setFeedState("idle");
    } catch {
      setFeedState("error");
    }
  }

  async function copy() {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(feed);
      setFeedState("copied");
    } catch {
      setFeedState("error");
    }
  }

  const tone = !status.enabled ? "off" : status.error || !status.fetchedAt ? "warn" : "ok";
  const headline =
    tone === "off"
      ? "Airbnb calendar not connected"
      : tone === "warn"
        ? status.fetchedAt
          ? "Airbnb sync problem"
          : "Airbnb calendar not read yet"
        : "Airbnb synced";
  const when = status.enabled && status.fetchedAt ? ago(status.fetchedAt) : null;

  return (
    <>
      <button
        type="button"
        onClick={openDetails}
        aria-label={`${headline}${when ? `, checked ${when}` : ""}${status.enabled && blocks.length ? `, ${blocks.length} not imported` : ""}. Airbnb calendar sync details`}
        className={cn(
          "mb-4 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs ring-1 ring-inset transition-colors sm:w-auto sm:min-w-96",
          tone === "warn" ? "bg-amber-50 ring-amber-200 hover:bg-amber-100/70" : "bg-white ring-slate-200 hover:bg-slate-50",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            tone === "off" ? "bg-slate-300" : tone === "warn" ? "bg-amber-500" : "bg-emerald-500",
          )}
        />
        <span className="min-w-0 flex-1 truncate">
          <span className={cn("font-medium", tone === "warn" ? "text-amber-900" : "text-slate-800")}>{headline}</span>
          {when ? <span className="text-slate-500"> · {when}</span> : null}
          {tone === "off" ? <span className="text-slate-500"> · set up</span> : null}
        </span>
        {status.enabled && blocks.length > 0 ? (
          <span className="shrink-0 rounded-full bg-airbnb-50 px-2 py-0.5 font-medium text-airbnb-700 ring-1 ring-airbnb-600/20 ring-inset">
            {blocks.length} not imported
          </span>
        ) : status.enabled && tone === "ok" ? (
          <span className="shrink-0 text-slate-500">All imported</span>
        ) : null}
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Airbnb calendar sync"
        description="Keeps Airbnb and direct bookings from landing on the same nights."
        footer={<Button onClick={() => setOpen(false)}>Close</Button>}
      >
        <div className="space-y-5 text-sm text-slate-700">
          <section>
            <h3 className="font-semibold text-slate-900">Airbnb → this app</h3>
            {!status.enabled ? (
              <p className="mt-1">
                Not connected. Add your Airbnb calendar link as <code>AIRBNB_ICAL_URL</code> in Vercel (Airbnb → listing →
                Availability → Connect calendars → Export calendar).
              </p>
            ) : (
              <>
                <p className="mt-1">
                  {status.fetchedAt ? `Read ${ago(status.fetchedAt)}; checked again every 10 minutes while in use.` : "Not read successfully yet."}
                  {status.error ? <span className="block text-amber-700">Last check failed: {status.error}. The last good copy is still used.</span> : null}
                </p>
                <p className="mt-2">
                  Airbnb reservations block those nights for direct bookings and guests&apos; requests.
                  {blocks.length === 0
                    ? " Every Airbnb reservation is already in the app."
                    : " Not imported yet (shown striped on the calendar; your next Airbnb CSV import adds them as bookings):"}
                </p>
                {blocks.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    {blocks.map((b) => (
                      <li key={`${b.code}${b.checkIn}`}>
                        {formatDateRange(b.checkIn, b.checkOut)}
                        {b.code ? ` · ${b.code}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>

          <section>
            <h3 className="font-semibold text-slate-900">This app → Airbnb</h3>
            {feedState === "loading" ? <p className="mt-1 text-slate-500">Loading…</p> : null}
            {feedState === "missing" ? (
              <p className="mt-1">
                Not set up: add a <code>CALENDAR_FEED_KEY</code> (any long random text) in Vercel and redeploy.
              </p>
            ) : null}
            {feed ? (
              <div className="mt-1 space-y-2">
                <p>
                  Paste this link into Airbnb so it closes your direct bookings and blocked dates: Airbnb → listing →
                  Availability →{" "}
                  <strong>Connect calendars → Import calendar</strong>. Airbnb re-reads it every few hours.
                </p>
                <Field label="Direct bookings calendar link">
                  {(id) => <Input id={id} readOnly value={feed} onFocus={(e) => e.currentTarget.select()} />}
                </Field>
                <Button size="sm" onClick={copy}>
                  {feedState === "copied" ? "Copied!" : "Copy link"}
                </Button>
                {feedState === "error" ? (
                  <p className="text-xs text-amber-700">Couldn&apos;t copy automatically — select the link and copy it.</p>
                ) : null}
                <p className="text-xs text-slate-500">
                  It lists dates only — no names or amounts. Keep it private; changing <code>CALENDAR_FEED_KEY</code> disables
                  it (then update it in Airbnb).
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </Modal>
    </>
  );
}
