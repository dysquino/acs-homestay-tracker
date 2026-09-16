"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { resetSampleData } from "./data/reset";
import type { Booking, CleaningRecord, Expense } from "./types";

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
 * turnover cleaning) in the client, at the cost of an extra round trip per
 * mutation — an acceptable trade for a small internal tool.
 */

type Data = {
  bookings: Booking[];
  expenses: Expense[];
  cleaning: CleaningRecord[];
};

type StoreValue = Data & {
  ready: boolean;
  addBooking: (input: Omit<Booking, "id">) => Promise<Booking>;
  updateBooking: (
    id: string,
    patch: Partial<Omit<Booking, "id">>,
  ) => Promise<void>;
  deleteBooking: (id: string) => Promise<void>;
  addExpense: (input: Omit<Expense, "id">) => Promise<Expense>;
  updateExpense: (
    id: string,
    patch: Partial<Omit<Expense, "id">>,
  ) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addCleaning: (input: Omit<CleaningRecord, "id">) => Promise<CleaningRecord>;
  updateCleaning: (
    id: string,
    patch: Partial<Omit<CleaningRecord, "id">>,
  ) => Promise<void>;
  deleteCleaning: (id: string) => Promise<void>;
  resetToSampleData: () => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);

const EMPTY: Data = { bookings: [], expenses: [], cleaning: [] };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const [bookings, expenses, cleaning] = await Promise.all([
      listBookings(),
      listExpenses(),
      listCleaning(),
    ]);
    setData({ bookings, expenses, cleaning });
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listBookings(), listExpenses(), listCleaning()]).then(
      ([bookings, expenses, cleaning]) => {
        if (cancelled) return;
        setData({ bookings, expenses, cleaning });
        setReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const addBooking = useCallback(
    async (input: Omit<Booking, "id">) => {
      const booking = await createBooking(input);
      await refresh();
      return booking;
    },
    [refresh],
  );

  const updateBooking = useCallback(
    async (id: string, patch: Partial<Omit<Booking, "id">>) => {
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

  const addExpense = useCallback(
    async (input: Omit<Expense, "id">) => {
      const expense = await createExpense(input);
      await refresh();
      return expense;
    },
    [refresh],
  );

  const updateExpense = useCallback(
    async (id: string, patch: Partial<Omit<Expense, "id">>) => {
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
      await updateCleaningAction(id, patch);
      await refresh();
    },
    [refresh],
  );

  const deleteCleaning = useCallback(
    async (id: string) => {
      await deleteCleaningAction(id);
      await refresh();
    },
    [refresh],
  );

  const resetToSampleData = useCallback(async () => {
    await resetSampleData();
    await refresh();
  }, [refresh]);

  const value = useMemo<StoreValue>(
    () => ({
      ...data,
      ready,
      addBooking,
      updateBooking,
      deleteBooking,
      addExpense,
      updateExpense,
      deleteExpense,
      addCleaning,
      updateCleaning,
      deleteCleaning,
      resetToSampleData,
    }),
    [
      data,
      ready,
      addBooking,
      updateBooking,
      deleteBooking,
      addExpense,
      updateExpense,
      deleteExpense,
      addCleaning,
      updateCleaning,
      deleteCleaning,
      resetToSampleData,
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
