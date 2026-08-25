const stats = [
  { label: "Upcoming check-ins", value: "4", tone: "sky" },
  { label: "This month income", value: "$6,420", tone: "emerald" },
  { label: "Expenses", value: "$1,980", tone: "amber" },
  { label: "Unpaid cleanings", value: "2", tone: "rose" },
];

const bookings = [
  { guest: "Alicia R.", source: "Airbnb", dates: "Aug 28 - Sep 2", status: "Paid" },
  { guest: "Matt S.", source: "Direct", dates: "Sep 1 - Sep 4", status: "Pending" },
  { guest: "Leah T.", source: "Airbnb", dates: "Sep 5 - Sep 9", status: "Paid" },
];

const cleanings = [
  { cleaner: "Maria", date: "Aug 27", amount: "$110", status: "Unpaid" },
  { cleaner: "Derrick", date: "Aug 30", amount: "$95", status: "Paid" },
  { cleaner: "Ana", date: "Sep 2", amount: "$120", status: "Unpaid" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-3 rounded-2xl bg-slate-900 px-6 py-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">ACs Homestay</p>
            <h1 className="mt-1 text-2xl font-semibold">Operations dashboard</h1>
          </div>
          <button className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-200">
            + Add booking
          </button>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className={`mb-4 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                stat.tone === "sky"
                  ? "bg-sky-100 text-sky-800"
                  : stat.tone === "emerald"
                    ? "bg-emerald-100 text-emerald-800"
                    : stat.tone === "amber"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
              }`}>
                {stat.label}
              </div>
              <div className="text-3xl font-semibold">{stat.value}</div>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Upcoming bookings</h2>
              <span className="text-sm text-slate-500">Calendar view</span>
            </div>

            <div className="grid gap-3">
              {bookings.map((booking) => (
                <div key={booking.guest} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <p className="font-medium text-slate-900">{booking.guest}</p>
                    <p className="text-sm text-slate-500">
                      {booking.source} • {booking.dates}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      booking.status === "Paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : booking.status === "Pending"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {booking.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Unpaid cleaning payments</h2>
              <span className="text-sm text-slate-500">3 total</span>
            </div>

            <div className="space-y-3">
              {cleanings.map((cleaning) => (
                <div key={`${cleaning.cleaner}-${cleaning.date}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-900">{cleaning.cleaner}</p>
                    <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800">
                      {cleaning.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                    <span>{cleaning.date}</span>
                    <span>{cleaning.amount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
