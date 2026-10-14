"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { today } from "@/lib/dates";
import { formatDateRange } from "@/lib/format";
import type { RoomStatus } from "@/lib/types";
import { useStore } from "@/lib/store";

type StatusConfig = {
  label: string;
  bg: string;
  text: string;
  ring: string;
  iconBg: string;
  icon: React.ReactNode;
};

const STATUS_CONFIG: Record<RoomStatus, StatusConfig> = {
  clean: {
    label: "Clean",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    iconBg: "bg-emerald-100",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        <path d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
        <path d="M18 15.5 18.8 17.6 21 18.5l-2.2.9-.8 2.1-.8-2.1-2.2-.9 2.2-.9.8-2.1Z" />
      </svg>
    ),
  },
  dirty: {
    label: "Dirty",
    bg: "bg-red-50",
    text: "text-red-700",
    ring: "ring-red-200",
    iconBg: "bg-red-100",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        <path d="M3 22V11a2 2 0 0 1 2-2h2.5" />
        <path d="M17.5 3.5 15 6l2 2" />
        <path d="M20.5 6.5 18 9l2 2" />
        <path d="M8 22v-7" />
        <path d="M12 15V8" />
        <path d="M5 22h14" />
        <path d="M8 15H5l1-3" />
        <path d="M16 15h3l-1-3" />
        <path d="M9.5 8 8 9.5 10.5 12 9.5 15H6" />
        <path d="M14.5 8 16 9.5 13.5 12 14.5 15H18" />
      </svg>
    ),
  },
  in_use: {
    label: "In-Use",
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-200",
    iconBg: "bg-blue-100",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.8V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.8" />
      </svg>
    ),
  },
};

/** Cycles to the next status: clean → dirty → in_use → clean. */
function toggleTarget(current: RoomStatus): RoomStatus {
  const order: RoomStatus[] = ["clean", "dirty", "in_use"];
  return order[(order.indexOf(current) + 1) % order.length];
}

/**
 * Derives the room's effective status from the booking schedule.
 *
 * Rules (in priority order):
 * 1. Active booking (checkIn <= today < checkOut) → in_use (absolute).
 * 2. Checkout day AND room is currently clean → auto-mark dirty.
 * 3. Otherwise → whatever the owner has set (persisted roomStatus).
 */
export function deriveRoomStatus(
  bookings: { checkIn: string; checkOut: string }[],
  today: string,
  persistedStatus: RoomStatus,
): RoomStatus {
  const active = bookings.find(
    (b) => b.checkIn <= today && b.checkOut > today,
  );
  if (active) return "in_use";

  const checkedOutToday = bookings.find((b) => b.checkOut === today);
  if (checkedOutToday && persistedStatus === "clean") return "dirty";

  return persistedStatus;
}

export function RoomStatusWidget() {
  const { bookings, roomStatus, setRoomStatus } = useStore();
  const t = today();

  const current = deriveRoomStatus(bookings, t, roomStatus);
  const cfg = STATUS_CONFIG[current];

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState<RoomStatus | null>(null);
  const [saving, setSaving] = useState(false);

  // The active booking shown on the pill when in_use.
  const activeBooking = bookings.find(
    (b) => b.checkIn <= t && b.checkOut > t,
  );

  function requestToggle() {
    setPending(toggleTarget(current));
    setConfirmOpen(true);
  }

  async function confirm() {
    if (!pending) return;
    setSaving(true);
    try {
      await setRoomStatus(pending);
      setConfirmOpen(false);
      setPending(null);
    } finally {
      setSaving(false);
    }
  }

  const pendingCfg = pending ? STATUS_CONFIG[pending] : null;

  return (
    <>
      <div
        className={`
          w-full rounded-2xl ring-2 ring-inset ${cfg.bg} ${cfg.ring}
          cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-transform
        `}
        onClick={requestToggle}
        role="button"
        aria-label={`Room status: ${cfg.label}. Click to change.`}
        aria-pressed={current === "dirty"}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); requestToggle(); } }}
      >
        <div className="flex items-center gap-3 px-5 py-3">
          {/* Status icon */}
          <div className={`shrink-0 rounded-full p-2 ${cfg.iconBg}`}>
            <div className={cfg.text}>{cfg.icon}</div>
          </div>

          {/* Status + details */}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</p>
            {current === "in_use" && activeBooking && (
              <p className="mt-0.5 text-xs text-blue-600 truncate">
                {activeBooking.guestName} · {formatDateRange(activeBooking.checkIn, activeBooking.checkOut)}
              </p>
            )}
            {current === "in_use" && !activeBooking && (
              <p className="mt-0.5 text-xs text-blue-400 italic">No active booking</p>
            )}
            <p className="mt-0.5 text-xs text-slate-500">
              {current === "dirty"
                ? "Needs cleaning — tap to change"
                : current === "clean"
                  ? "Ready for guests — tap to change"
                  : "Occupied — tap to change"}
            </p>
          </div>

          {/* Toggle arrow */}
          <div className="shrink-0 text-slate-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setPending(null);
        }}
        title="Change room status"
        footer={
          <>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                setPending(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" disabled={saving} onClick={confirm}>
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </>
        }
      >
        {pendingCfg && (
          <p className="text-sm text-slate-600">
            Change room status from{" "}
            <strong className={STATUS_CONFIG[current].text}>{cfg.label}</strong>{" "}
            to{" "}
            <strong className={pendingCfg.text}>{pendingCfg.label}</strong>
            {pending === "dirty" && (
              <> — mark the room as needing cleaning before the next guest.</>
            )}
            {pending === "clean" && (
              <> — confirm the room has been cleaned and is ready.</>
            )}
            {pending === "in_use" && (
              <> — mark the room as occupied.</>
            )}
          </p>
        )}
      </Modal>
    </>
  );
}
