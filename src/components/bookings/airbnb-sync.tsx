"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
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
 * One line under the Bookings header: is the Airbnb calendar being read, and
 * which Airbnb reservations aren't imported yet (they block direct bookings).
 * "Airbnb calendar sync" opens the details plus the direct-bookings feed link
 * to paste into Airbnb, so Airbnb blocks those nights too.
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

  const summary = !status.enabled
    ? "Airbnb calendar not connected"
    : status.fetchedAt
      ? `Airbnb calendar checked ${ago(status.fetchedAt)}${blocks.length ? ` · ${blocks.length} reservation${blocks.length === 1 ? "" : "s"} not imported yet` : " · all reservations imported"}`
      : "Airbnb calendar couldn't be read yet";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${!status.enabled ? "bg-slate-300" : status.error ? "bg-amber-500" : "bg-emerald-500"}`}
          />
          {summary}
          {status.enabled && status.error ? <span className="text-amber-700"> · last check failed</span> : null}
        </span>
        <button type="button" onClick={openDetails} className="font-medium text-brand-700 hover:underline pointer-coarse:py-2">
          Airbnb calendar sync
        </button>
      </div>

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
                  Paste this link into Airbnb so it blocks your direct bookings: Airbnb → listing → Availability →{" "}
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
