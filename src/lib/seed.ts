import { addDays, startOfMonth, today } from "./dates";
import type { Booking, CleaningRecord, Expense } from "./types";

/**
 * Sample data so the app is explorable before the Supabase backend exists.
 * Everything is generated relative to today, so the dashboard's "next 7 days"
 * and "this month" panels always have something in them.
 */
export function buildSeedData(): {
  bookings: Booking[];
  expenses: Expense[];
  cleaning: CleaningRecord[];
} {
  const t = today();
  const monthStart = startOfMonth(t);

  const bookings: Booking[] = [
    {
      id: "bk_1",
      guestName: "Maria Santos",
      source: "airbnb",
      checkIn: addDays(t, -12),
      checkOut: addDays(t, -9),
      guestsCount: 2,
      totalPayout: 8400,
      platformFee: 1050,
      paymentStatus: "paid",
      contactInfo: "",
      notes: "Late check-in, arrived 11pm.",
      createdBy: "Owner",
    },
    {
      id: "bk_2",
      guestName: "Daniel Reyes",
      source: "direct",
      checkIn: addDays(t, -4),
      checkOut: addDays(t, -1),
      guestsCount: 4,
      totalPayout: 9600,
      platformFee: 0,
      paymentStatus: "paid",
      contactInfo: "0917 555 0143",
      notes: "Repeat guest — asked for extra towels.",
      createdBy: "Owner",
    },
    {
      id: "bk_3",
      guestName: "Aiko Tanaka",
      source: "airbnb",
      checkIn: addDays(t, 1),
      checkOut: addDays(t, 4),
      guestsCount: 2,
      totalPayout: 10200,
      platformFee: 1275,
      paymentStatus: "pending",
      contactInfo: "",
      notes: "",
      createdBy: "Owner",
    },
    {
      id: "bk_4",
      guestName: "Grace Villanueva",
      source: "direct",
      checkIn: addDays(t, 5),
      checkOut: addDays(t, 8),
      guestsCount: 3,
      totalPayout: 8700,
      platformFee: 0,
      paymentStatus: "partial",
      contactInfo: "grace.v@example.com",
      notes: "Paid ₱4,000 deposit via GCash.",
      createdBy: "Manager",
    },
    {
      id: "bk_5",
      guestName: "Liam Foster",
      source: "airbnb",
      checkIn: addDays(t, 14),
      checkOut: addDays(t, 18),
      guestsCount: 2,
      totalPayout: 13600,
      platformFee: 1700,
      paymentStatus: "pending",
      contactInfo: "",
      notes: "",
      createdBy: "Owner",
    },
  ];

  const cleaning: CleaningRecord[] = [
    {
      id: "cl_1",
      date: addDays(t, -9),
      bookingId: "bk_1",
      cleanerName: "Ate Nene",
      status: "completed",
      paymentAmount: 800,
      paymentStatus: "paid",
      notes: "",
      createdBy: "Owner",
    },
    {
      id: "cl_2",
      date: addDays(t, -1),
      bookingId: "bk_2",
      cleanerName: "Ate Nene",
      status: "completed",
      paymentAmount: 800,
      paymentStatus: "unpaid",
      notes: "Laundry included — 2 loads.",
      createdBy: "Owner",
    },
    {
      id: "cl_3",
      date: addDays(t, 4),
      bookingId: "bk_3",
      cleanerName: "Kuya Ben",
      status: "scheduled",
      paymentAmount: 800,
      paymentStatus: "unpaid",
      notes: "",
      createdBy: "Owner",
    },
    {
      id: "cl_4",
      date: addDays(t, 8),
      bookingId: "bk_4",
      cleanerName: "",
      status: "scheduled",
      paymentAmount: 800,
      paymentStatus: "unpaid",
      notes: "Restock coffee and toiletries.",
      createdBy: "Manager",
    },
    {
      id: "cl_5",
      date: addDays(t, 18),
      bookingId: "bk_5",
      cleanerName: "",
      status: "scheduled",
      paymentAmount: 800,
      paymentStatus: "unpaid",
      notes: "",
      createdBy: "Owner",
    },
  ];

  const expenses: Expense[] = [
    {
      id: "ex_1",
      date: addDays(monthStart, 2),
      category: "dues",
      description: "Condo association dues",
      amount: 3500,
      paidBy: "Owner",
      receiptUrl: "",
      createdBy: "Owner",
    },
    {
      id: "ex_2",
      date: addDays(monthStart, 5),
      category: "utility",
      description: "Meralco electricity bill",
      amount: 2870,
      paidBy: "Owner",
      receiptUrl: "",
      createdBy: "Owner",
    },
    {
      id: "ex_3",
      date: addDays(monthStart, 6),
      category: "utility",
      description: "Maynilad water bill",
      amount: 640,
      paidBy: "Manager",
      receiptUrl: "",
      createdBy: "Manager",
    },
    {
      id: "ex_4",
      date: addDays(monthStart, 8),
      category: "supplies",
      description: "Toiletries, coffee, bottled water restock",
      amount: 1240,
      paidBy: "Manager",
      receiptUrl: "",
      createdBy: "Manager",
    },
    {
      id: "ex_5",
      date: addDays(t, -9),
      category: "cleaning",
      description: "Cleaning payment — Ate Nene",
      amount: 800,
      paidBy: "Owner",
      receiptUrl: "",
      createdBy: "Owner",
    },
    {
      id: "ex_6",
      date: addDays(monthStart, -14),
      category: "repairs",
      description: "Aircon cleaning and freon top-up",
      amount: 2200,
      paidBy: "Owner",
      receiptUrl: "",
      createdBy: "Owner",
    },
  ];

  return { bookings, expenses, cleaning };
}
