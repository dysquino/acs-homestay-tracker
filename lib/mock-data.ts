export type BookingSource = "Airbnb" | "Direct";
export type PaymentStatus = "Paid" | "Pending" | "Partial";

export type Booking = {
  id: string;
  guestName: string;
  source: BookingSource;
  checkIn: string;
  checkOut: string;
  guestsCount: number;
  totalPayout: number;
  platformFee: number;
  paymentStatus: PaymentStatus;
  contactInfo: string;
  notes: string;
};

export const initialBookings: Booking[] = [
  {
    id: "bk-101",
    guestName: "Alicia Reynolds",
    source: "Airbnb",
    checkIn: "2026-08-28",
    checkOut: "2026-09-02",
    guestsCount: 2,
    totalPayout: 760,
    platformFee: 52,
    paymentStatus: "Paid",
    contactInfo: "alicia@example.com",
    notes: "Late checkout requested.",
  },
  {
    id: "bk-102",
    guestName: "Matt Sullivan",
    source: "Direct",
    checkIn: "2026-09-01",
    checkOut: "2026-09-04",
    guestsCount: 3,
    totalPayout: 680,
    platformFee: 0,
    paymentStatus: "Pending",
    contactInfo: "(555) 010-2121",
    notes: "Airport pickup arranged.",
  },
  {
    id: "bk-103",
    guestName: "Leah Thompson",
    source: "Airbnb",
    checkIn: "2026-09-05",
    checkOut: "2026-09-09",
    guestsCount: 2,
    totalPayout: 820,
    platformFee: 55,
    paymentStatus: "Paid",
    contactInfo: "leah@example.com",
    notes: "Needs extra towels.",
  },
];

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);

export function hasDateOverlap(
  checkIn: string,
  checkOut: string,
  existingCheckIn: string,
  existingCheckOut: string,
) {
  const startA = new Date(checkIn).getTime();
  const endA = new Date(checkOut).getTime();
  const startB = new Date(existingCheckIn).getTime();
  const endB = new Date(existingCheckOut).getTime();

  return startA < endB && endA > startB;
}
