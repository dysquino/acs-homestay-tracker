"use client";

import { useMemo } from "react";

import { buildActionItems, type ActionItem } from "./action-items";
import { today } from "./dates";
import { useStore } from "./store";

/**
 * The dashboard's action items from the current store data. Shared by the
 * widget and the navigation badge, so both always agree. Recomputed whenever
 * the data changes — including the store's background refresh every minute,
 * which keeps "waiting 5 h" and "overdue" up to date.
 */
export function useActionItems(): ActionItem[] {
  const { bookings, cleaning, expenses, bookingRequests, airbnbFinished, airbnbStatus } = useStore();
  const t = today();
  return useMemo(
    () =>
      buildActionItems({
        bookings,
        cleaning,
        expenses,
        bookingRequests,
        airbnbFinished,
        airbnbError: airbnbStatus.enabled ? airbnbStatus.error : null,
        today: t,
        now: new Date(),
      }),
    [bookings, cleaning, expenses, bookingRequests, airbnbFinished, airbnbStatus, t],
  );
}
