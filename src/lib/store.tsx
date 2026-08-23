"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import { buildSeedData } from "./seed";
import { useClientState } from "./use-client-state";
import type { Booking, CleaningRecord, Expense } from "./types";

/**
 * Client-side data layer.
 *
 * For now records live in localStorage so the UI can be built and tested
 * before the Supabase/Prisma backend exists. Every read and write goes
 * through this module, so swapping in real API calls later means changing
 * this file only — no page or component touches storage directly.
 */

const STORAGE_KEY = "acs-homestay-tracker:v1";

/** Default cleaner fee pre-filled on auto-created turnover records. */
export const DEFAULT_CLEANING_FEE = 800;

type Data = {
  bookings: Booking[];
  expenses: Expense[];
  cleaning: CleaningRecord[];
};

type StoreValue = Data & {
  ready: boolean;
  addBooking: (input: Omit<Booking, "id">) => Booking;
  updateBooking: (id: string, patch: Partial<Omit<Booking, "id">>) => void;
  deleteBooking: (id: string) => void;
  addExpense: (input: Omit<Expense, "id">) => Expense;
  updateExpense: (id: string, patch: Partial<Omit<Expense, "id">>) => void;
  deleteExpense: (id: string) => void;
  addCleaning: (input: Omit<CleaningRecord, "id">) => CleaningRecord;
  updateCleaning: (
    id: string,
    patch: Partial<Omit<CleaningRecord, "id">>,
  ) => void;
  deleteCleaning: (id: string) => void;
  resetToSampleData: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

const EMPTY: Data = { bookings: [], expenses: [], cleaning: [] };

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function load(): Data {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildSeedData();
    const parsed = JSON.parse(raw) as Partial<Data>;
    return {
      bookings: parsed.bookings ?? [],
      expenses: parsed.expenses ?? [],
      cleaning: parsed.cleaning ?? [],
    };
  } catch {
    return buildSeedData();
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, ready, setData] = useClientState<Data>(load, EMPTY);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, ready]);

  const addBooking = useCallback((input: Omit<Booking, "id">) => {
    const booking: Booking = { ...input, id: uid("bk") };
    // Confirmed requirement: every booking auto-suggests the turnover clean
    // for its check-out date. The user can reassign or delete it afterward.
    const turnover: CleaningRecord = {
      id: uid("cl"),
      date: booking.checkOut,
      bookingId: booking.id,
      cleanerName: "",
      status: "scheduled",
      paymentAmount: DEFAULT_CLEANING_FEE,
      paymentStatus: "unpaid",
      notes: "",
      createdBy: booking.createdBy,
    };
    setData((d) => ({
      ...d,
      bookings: [...d.bookings, booking],
      cleaning: [...d.cleaning, turnover],
    }));
    return booking;
  }, [setData]);

  const updateBooking = useCallback(
    (id: string, patch: Partial<Omit<Booking, "id">>) => {
      setData((d) => {
        const bookings = d.bookings.map((b) =>
          b.id === id ? { ...b, ...patch } : b,
        );
        // Keep an untouched auto-created turnover in step with its check-out
        // date. Once someone marks it completed we leave it alone.
        const cleaning =
          patch.checkOut === undefined
            ? d.cleaning
            : d.cleaning.map((c) =>
                c.bookingId === id && c.status === "scheduled"
                  ? { ...c, date: patch.checkOut as string }
                  : c,
              );
        return { ...d, bookings, cleaning };
      });
    },
    [setData],
  );

  const deleteBooking = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      bookings: d.bookings.filter((b) => b.id !== id),
      // Drop turnovers that were auto-created and never touched; keep any
      // real work that happened, just unlinked from the deleted booking.
      cleaning: d.cleaning
        .filter(
          (c) =>
            !(
              c.bookingId === id &&
              c.status === "scheduled" &&
              c.paymentStatus === "unpaid" &&
              c.cleanerName.trim() === ""
            ),
        )
        .map((c) => (c.bookingId === id ? { ...c, bookingId: null } : c)),
    }));
  }, [setData]);

  const addExpense = useCallback((input: Omit<Expense, "id">) => {
    const expense: Expense = { ...input, id: uid("ex") };
    setData((d) => ({ ...d, expenses: [...d.expenses, expense] }));
    return expense;
  }, [setData]);

  const updateExpense = useCallback(
    (id: string, patch: Partial<Omit<Expense, "id">>) => {
      setData((d) => ({
        ...d,
        expenses: d.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }));
    },
    [setData],
  );

  const deleteExpense = useCallback((id: string) => {
    setData((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) }));
  }, [setData]);

  const addCleaning = useCallback((input: Omit<CleaningRecord, "id">) => {
    const record: CleaningRecord = { ...input, id: uid("cl") };
    setData((d) => ({ ...d, cleaning: [...d.cleaning, record] }));
    return record;
  }, [setData]);

  const updateCleaning = useCallback(
    (id: string, patch: Partial<Omit<CleaningRecord, "id">>) => {
      setData((d) => ({
        ...d,
        cleaning: d.cleaning.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    },
    [setData],
  );

  const deleteCleaning = useCallback((id: string) => {
    setData((d) => ({ ...d, cleaning: d.cleaning.filter((c) => c.id !== id) }));
  }, [setData]);

  const resetToSampleData = useCallback(() => {
    setData(buildSeedData());
  }, [setData]);

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
