"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { today } from "@/lib/dates";
import type { RoomStatus } from "@/lib/types";
import { useStore } from "@/lib/store";

const STATUS_CONFIG: Record<
  RoomStatus,
  { label: string; bg: string; text: string; ring: string }
> = {
  clean: {
    label: "Clean",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  dirty: {
    label: "Dirty",
    bg: "bg-red-50",
    text: "text-red-700",
    ring: "ring-red-200",
  },
  in_use: {
    label: "In-Use",
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-200",
  },
};

/** The opposite of the current toggleable status, for the confirm modal. */
function toggleTarget(current: RoomStatus): RoomStatus {
  return current === "dirty" ? "clean" : "dirty";
}

/**
 * Derives the room's effective status from the booking schedule.
 *
 * Rules (in priority order):
 * 1. Active booking (checkIn <= today < checkOut) → in_use (absolute).
 * 2. Checkout day AND room is currently clean → auto-mark dirty.
 * 3. Otherwise → whatever the owner has set (persisted roomStatus).
 *
 * Rule 2 means the auto-dirty only fires on the first checkout after the
 * room was cleaned; a manual dirty-from-owner is not overridden.
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

  // The persisted status (owner override). The derived status tells us what the
  // pill colour should actually be — in_use overrides everything.
  const current = deriveRoomStatus(bookings, t, roomStatus);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState<RoomStatus | null>(null);
  const [saving, setSaving] = useState(false);

  const cfg = STATUS_CONFIG[current];
  const isReadOnly = current === "in_use";

  function requestToggle() {
    if (isReadOnly) return;
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
      <button
        type="button"
        onClick={requestToggle}
        disabled={isReadOnly}
        title={isReadOnly ? "Status is set automatically by an active booking" : "Tap to change status"}
        className={`
          inline-flex items-center gap-1.5 rounded-full px-4 py-1.5
          ring-2 ring-inset transition-all text-sm font-semibold
          ${cfg.bg} ${cfg.text} ${cfg.ring}
          ${!isReadOnly ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default opacity-90"}
        `}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${current === "clean" ? "bg-emerald-500" : current === "dirty" ? "bg-red-500" : "bg-blue-500"}`}
        />
        {cfg.label}
        {!isReadOnly && (
          <span aria-hidden="true" className="text-xs opacity-60">↻</span>
        )}
      </button>

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
            <Button
              variant="primary"
              disabled={saving}
              onClick={confirm}
            >
              {saving ? "Saving…" : `Confirm`}
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
          </p>
        )}
      </Modal>
    </>
  );
}
