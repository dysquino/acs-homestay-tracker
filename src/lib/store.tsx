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

import {
  createBooking,
  deleteBooking as deleteBookingAction,
  listBookings,
  updateBooking as updateBookingAction,
} from "./data/bookings";
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
import type { Booking, BookingInput, CleaningRecord, Expense, ExpenseInput } from "./types";

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
 * resolves, all three lists are refetched from the server rather than
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
  deleteBooking: (id: string) => Promise<void>;
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
};

const StoreContext = createContext<StoreValue | null>(null);

const EMPTY: Data = { bookings: [], expenses: [], cleaning: [] };

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useIdentity();
  const actor = user.name;

  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [syncError, setSyncError] = useState(false);

  // Only the newest request may write state, so a slow older response can't
  // overwrite fresher data.
  const latest = useRef(0);
  const fetchAll = useCallback(async () => {
    const request = ++latest.current;
    const [bookings, expenses, cleaning] = await Promise.all([
      listBookings(),
      listExpenses(),
      listCleaning(),
    ]);
    if (request === latest.current) setData({ bookings, expenses, cleaning });
  }, []);

  const refresh = useCallback(async () => {
    try {
      await fetchAll();
      setSyncError(false);
    } catch {
      setSyncError(true);
    }
  }, [fetchAll]);

  const load = useCallback(() => {
    fetchAll().then(
      () => {
        setLoadError(false);
        setReady(true);
      },
      () => setLoadError(true),
    );
  }, [fetchAll]);

  useEffect(() => {
    load();
  }, [load]);

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
    async (id: string) => {
      await deleteBookingAction(id);
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
