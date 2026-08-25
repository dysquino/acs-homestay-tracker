"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  formatCurrency,
  hasDateOverlap,
  initialBookings,
  type Booking,
} from "@/lib/mock-data";

const emptyForm = {
  guestName: "",
  source: "Airbnb" as Booking["source"],
  checkIn: "",
  checkOut: "",
  guestsCount: 2,
  totalPayout: 0,
  platformFee: 0,
  paymentStatus: "Pending" as Booking["paymentStatus"],
  contactInfo: "",
  notes: "",
};

export function BookingsDashboard() {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [form, setForm] = useState(emptyForm);
  const [warning, setWarning] = useState<string | null>(null);

  const upcomingCount = useMemo(() => {
    const today = new Date();
    return bookings.filter((booking) => new Date(booking.checkIn) >= today).length;
  }, [bookings]);

  const monthIncome = useMemo(
    () => bookings.reduce((sum, booking) => sum + booking.totalPayout, 0),
    [bookings],
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const overlap = bookings.some((booking) =>
      hasDateOverlap(form.checkIn, form.checkOut, booking.checkIn, booking.checkOut),
    );

    if (overlap) {
      setWarning(
        `This booking overlaps with ${bookings[0]?.guestName ?? "an existing booking"}. Review dates before saving.`,
      );
      return;
    }

    setWarning(null);
    const nextBooking: Booking = {
      id: `bk-${Date.now()}`,
      guestName: form.guestName,
      source: form.source,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      guestsCount: form.guestsCount,
      totalPayout: Number(form.totalPayout),
      platformFee: Number(form.platformFee),
      paymentStatus: form.paymentStatus,
      contactInfo: form.contactInfo,
      notes: form.notes,
    };

    setBookings((current) => [nextBooking, ...current]);
    setForm(emptyForm);
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-3 rounded-2xl bg-slate-900 px-6 py-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Bookings</p>
            <h1 className="mt-1 text-2xl font-semibold">Reservation board</h1>
          </div>
          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-200"
          >
            Back to dashboard
          </Link>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Upcoming stays</p>
            <p className="mt-2 text-3xl font-semibold">{upcomingCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total booked payout</p>
            <p className="mt-2 text-3xl font-semibold">{formatCurrency(monthIncome)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Current records</p>
            <p className="mt-2 text-3xl font-semibold">{bookings.length}</p>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Bookings</h2>
              <span className="text-sm text-slate-500">List view</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-2 py-3 font-medium">Guest</th>
                    <th className="px-2 py-3 font-medium">Source</th>
                    <th className="px-2 py-3 font-medium">Dates</th>
                    <th className="px-2 py-3 font-medium">Payout</th>
                    <th className="px-2 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-2 py-3">
                        <div className="font-medium text-slate-900">{booking.guestName}</div>
                        <div className="text-xs text-slate-500">{booking.contactInfo || "No contact info"}</div>
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            booking.source === "Airbnb"
                              ? "bg-sky-100 text-sky-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {booking.source}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-slate-600">
                        {booking.checkIn} - {booking.checkOut}
                      </td>
                      <td className="px-2 py-3 font-medium text-slate-800">
                        {formatCurrency(booking.totalPayout)}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            booking.paymentStatus === "Paid"
                              ? "bg-emerald-100 text-emerald-800"
                              : booking.paymentStatus === "Pending"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {booking.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add booking</h2>
              <span className="text-sm text-slate-500">Manual entry</span>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Guest name</label>
                <input
                  required
                  value={form.guestName}
                  onChange={(event) => setForm({ ...form, guestName: event.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-0 transition focus:border-slate-400"
                  placeholder="Jane Doe"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Source</label>
                  <select
                    value={form.source}
                    onChange={(event) =>
                      setForm({ ...form, source: event.target.value as Booking["source"] })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                  >
                    <option value="Airbnb">Airbnb</option>
                    <option value="Direct">Direct</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Payment status</label>
                  <select
                    value={form.paymentStatus}
                    onChange={(event) =>
                      setForm({ ...form, paymentStatus: event.target.value as Booking["paymentStatus"] })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                    <option value="Partial">Partial</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Check-in</label>
                  <input
                    required
                    type="date"
                    value={form.checkIn}
                    onChange={(event) => setForm({ ...form, checkIn: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Check-out</label>
                  <input
                    required
                    type="date"
                    value={form.checkOut}
                    onChange={(event) => setForm({ ...form, checkOut: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Guests</label>
                  <input
                    type="number"
                    min={1}
                    value={form.guestsCount}
                    onChange={(event) =>
                      setForm({ ...form, guestsCount: Number(event.target.value) || 1 })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Total payout</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.totalPayout}
                    onChange={(event) =>
                      setForm({ ...form, totalPayout: Number(event.target.value) || 0 })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Platform fee</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.platformFee}
                  onChange={(event) =>
                    setForm({ ...form, platformFee: Number(event.target.value) || 0 })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Contact info</label>
                <input
                  value={form.contactInfo}
                  onChange={(event) => setForm({ ...form, contactInfo: event.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                  placeholder="Email or phone"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  className="min-h-24 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                  placeholder="Special requests, arrival notes, etc."
                />
              </div>

              {warning ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {warning}
                </div>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Save booking
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
