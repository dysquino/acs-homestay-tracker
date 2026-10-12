"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { AirbnbReservation } from "./airbnb-ical";
import { listAirbnbBlocks } from "./data/airbnb";
import type { AirbnbSyncStatus } from "./data/airbnb-calendar";
import {
  approveBookingRequest,
  declineBookingRequest,
  listBookingRequests,
  type DecideResult,
} from "./data/booking-requests";
import {
  createBooking,
  deleteBooking as deleteBookingAction,
  listBookings,
  updateBooking as updateBookingAction,
} from "./data/bookings";
import {
  createDateBlock,
  deleteDateBlock as deleteDateBlockAction,
  listDateBlocks,
  type BlockResult,
} from "./data/date-blocks";
import {
  createCleaning,
  deleteCleaning as deleteCleaningAction,
  listCleaning,
  updateCleaning as updateCleaningAction,
} from "./data/cleaning";
import {
  createExpense,
  deleteExpense as deleteExpenseAction,
  listExpenses,
  updateExpense as updateExpenseAction,
} from "./data/expenses";
import { importAirbnbBookings, type ImportInstruction, type ImportResult } from "./data/import";
import { useIdentity } from "./identity";
import type {
  Booking,
  BookingInput,
  BookingRequest,
  CleaningRecord,
  DateBlock,
  DateBlockInput,
  Expense,
  ExpenseInput,
} from "./types";

export { DEFAULT_CLEANING_FEE } from "./constants";

/**
 * Client-side data layer.
 *
 * Backed by Supabase Postgres via Prisma Server Actions (see `./data/`).
 * Every read and write still goes through this module — pages and
 * components never call the server actions directly — so this remains the
 * one place that knows how data gets in and out.
 *
 * Mutations use a refresh-after-write pattern: after a create/update/delete
 * resolves, all the lists are refetched from the server rather than
 * patched optimistically in local state. Simpler and less error-prone than
 * mirroring the server's cross-table logic (e.g. a booking's auto-created
 * turnover cleaning, or a paid cleaning's expense) in the client, at the
 * cost of an extra round trip per mutation — an acceptable trade for a
 * small internal tool.
 *
 * A failed refetch never makes a *successful* write look failed (that would
 * invite a retry, and a duplicate record): it sets `syncError` instead, and
 * the shell offers a Retry. A failed first load sets `loadError`.
 */

type Data = {
  bookings: Booking[];
  expenses: Expense[];
  cleaning: CleaningRecord[];
  /** Guests' pending requests from the booking link. */
  bookingRequests: BookingRequest[];
  /** Airbnb reservations not in the app yet — they block direct bookings. */
  airbnbBlocks: AirbnbReservation[];
  /** Airbnb stays that ended but were never imported (payout missing). */
  airbnbFinished: AirbnbReservation[];
  airbnbStatus: AirbnbSyncStatus;
  /** Dates the owners closed with no guest (maintenance, own use). */
  dateBlocks: DateBlock[];
};

type StoreValue = Data & {
  ready: boolean;
  /** The first load failed — there is no data to show yet. */
  loadError: boolean;
  /** A refetch after a write failed — what's on screen may be out of date. */
  syncError: boolean;
  /** Retry the first load. */
  reload: () => void;
  /** Retry a failed refetch. */
  resync: () => Promise<void>;
  addBooking: (input: BookingInput) => Promise<Booking>;
  updateBooking: (
    id: string,
    patch: Partial<BookingInput>,
  ) => Promise<void>;
  /** `withCleanings` also deletes cleanings a plain delete would keep. */
  deleteBooking: (id: string, options?: { withCleanings?: boolean }) => Promise<void>;
  importBookings: (items: ImportInstruction[]) => Promise<ImportResult>;
  addExpense: (input: ExpenseInput) => Promise<Expense>;
  updateExpense: (
    id: string,
    patch: Partial<ExpenseInput>,
  ) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addCleaning: (input: Omit<CleaningRecord, "id">) => Promise<CleaningRecord>;
  updateCleaning: (
    id: string,
    patch: Partial<Omit<CleaningRecord, "id">>,
  ) => Promise<void>;
  deleteCleaning: (id: string) => Promise<void>;
  /** Resolves with the created booking, or an error to show (e.g. dates taken). */
  approveRequest: (id: string) => Promise<DecideResult>;
  declineRequest: (id: string) => Promise<DecideResult>;
  /** Resolves with the block, or an error to show (e.g. a booking is on those dates). */
  addDateBlock: (input: DateBlockInput) => Promise<BlockResult>;
  deleteDateBlock: (id: string) => Promise<void>;
};

/** Background re-read while the app is open and visible (see StoreProvider). */
const AUTO_REFRESH_MS = 60_000;
/** Switching tabs back and forth doesn't re-read more often than this. */
const MIN_REFRESH_GAP_MS = 10_000;

const StoreContext = createContext<StoreValue | null>(null);

const EMPTY: Data = {
  bookings: [],
  expenses: [],
  cleaning: [],
  bookingRequests: [],
  airbnbBlocks: [],
  airbnbFinished: [],
  airbnbStatus: { enabled: false, fetchedAt: null, error: null },
  dateBlocks: [],
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useIdentity();
  const actor = user.name;

  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [syncError, setSyncError] = useState(false);

  // Only the newest request may write state, so a slow older response can't
  // overwrite fresher data. A superseded request — succeeded or failed —
  // resolves `false` and changes nothing: the newer one settles the state.
  // (Dev mode's double-run effect always supersedes the first load; marking
  // the app ready on that one showed the dashboard with no data for a moment.)
  const latest = useRef(0);
  const fetchAll = useCallback(async (): Promise<boolean> => {
    const request = ++latest.current;
    let lists;
    try {
      lists = await Promise.all([
        listBookings(),
        listExpenses(),
        listCleaning(),
        listBookingRequests(),
        listAirbnbBlocks(),
        listDateBlocks(),
      ]);
    } catch (error) {
      if (request !== latest.current) return false;
      throw error;
    }
    if (request !== latest.current) return false;
    const [bookings, expenses, cleaning, bookingRequests, airbnb, dateBlocks] = lists;
    setData({
      bookings,
      expenses,
      cleaning,
      bookingRequests,
      airbnbBlocks: airbnb.blocks,
      airbnbFinished: airbnb.finished,
      airbnbStatus: airbnb.status,
      dateBlocks,
    });
    return true;
  }, []);

  const refresh = useCallback(async () => {
    try {
      if (await fetchAll()) setSyncError(false);
    } catch {
      setSyncError(true);
    }
  }, [fetchAll]);

  const load = useCallback(() => {
    fetchAll().then(
      (applied) => {
        if (!applied) return;
        setLoadError(false);
        setReady(true);
      },
      () => setLoadError(true),
    );
  }, [fetchAll]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the screen current with changes made elsewhere — a guest's new
  // booking request, or a co-owner editing on another device: re-read the
  // data when the tab comes back into view, and every minute while it's
  // visible. Read-only for the app's data: it only calls the list actions in
  // fetchAll, never a write (reading the Airbnb feed may refresh its own
  // cache row — never bookings, expenses, cleaning or requests). It
  // doesn't disturb open forms (they keep their own copy of the fields) and
  // the newest-request rule above means it can't overwrite a save's result. A failed background read is ignored —
  // the data on screen stays, and the next tick tries again.
  const lastFetch = useRef(0);
  useEffect(() => {
    if (!ready) return;
    const quietRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetch.current < MIN_REFRESH_GAP_MS) return;
      lastFetch.current = Date.now();
      fetchAll().catch(() => {});
    };
    lastFetch.current = Date.now();
    const timer = window.setInterval(quietRefresh, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", quietRefresh);
    window.addEventListener("focus", quietRefresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", quietRefresh);
      window.removeEventListener("focus", quietRefresh);
    };
  }, [ready, fetchAll]);

  const reload = useCallback(() => {
    setLoadError(false);
    load();
  }, [load]);

  const addBooking = useCallback(
    async (input: BookingInput) => {
      const booking = await createBooking(input);
      await refresh();
      return booking;
    },
    [refresh],
  );

  const updateBooking = useCallback(
    async (id: string, patch: Partial<BookingInput>) => {
      await updateBookingAction(id, patch);
      await refresh();
    },
    [refresh],
  );

  const deleteBooking = useCallback(
    async (id: string, options?: { withCleanings?: boolean }) => {
      await deleteBookingAction(id, options);
      await refresh();
    },
    [refresh],
  );

  const importBookings = useCallback(
    async (items: ImportInstruction[]) => {
      const result = await importAirbnbBookings(items, actor);
      await refresh();
      return result;
    },
    [refresh, actor],
  );

  const addExpense = useCallback(
    async (input: ExpenseInput) => {
      const expense = await createExpense(input);
      await refresh();
      return expense;
    },
    [refresh],
  );

  const updateExpense = useCallback(
    async (id: string, patch: Partial<ExpenseInput>) => {
      await updateExpenseAction(id, patch);
      await refresh();
    },
    [refresh],
  );

  const deleteExpense = useCallback(
    async (id: string) => {
      await deleteExpenseAction(id);
      await refresh();
    },
    [refresh],
  );

  const addCleaning = useCallback(
    async (input: Omit<CleaningRecord, "id">) => {
      const record = await createCleaning(input);
      await refresh();
      return record;
    },
    [refresh],
  );

  const updateCleaning = useCallback(
    async (id: string, patch: Partial<Omit<CleaningRecord, "id">>) => {
      await updateCleaningAction(id, patch, actor);
      await refresh();
    },
    [refresh, actor],
  );

  const deleteCleaning = useCallback(
    async (id: string) => {
      await deleteCleaningAction(id);
      await refresh();
    },
    [refresh],
  );

  const approveRequest = useCallback(
    async (id: string) => {
      const result = await approveBookingRequest(id, actor);
      await refresh();
      return result;
    },
    [refresh, actor],
  );

  const declineRequest = useCallback(
    async (id: string) => {
      const result = await declineBookingRequest(id, actor);
      await refresh();
      return result;
    },
    [refresh, actor],
  );

  const addDateBlock = useCallback(
    async (input: DateBlockInput) => {
      const result = await createDateBlock(input);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const deleteDateBlock = useCallback(
    async (id: string) => {
      await deleteDateBlockAction(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...data,
      ready,
      loadError,
      syncError,
      reload,
      resync: refresh,
      addBooking,
      updateBooking,
      deleteBooking,
      importBookings,
      addExpense,
      updateExpense,
      deleteExpense,
      addCleaning,
      updateCleaning,
      deleteCleaning,
      approveRequest,
      declineRequest,
      addDateBlock,
      deleteDateBlock,
    }),
    [
      data,
      ready,
      loadError,
      syncError,
      reload,
      refresh,
      addBooking,
      updateBooking,
      deleteBooking,
      importBookings,
      addExpense,
      updateExpense,
      deleteExpense,
      addCleaning,
      updateCleaning,
      deleteCleaning,
      approveRequest,
      declineRequest,
      addDateBlock,
      deleteDateBlock,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
