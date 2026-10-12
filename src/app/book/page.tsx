import type { Metadata } from "next";
import Image from "next/image";

import { BookingRequestForm } from "@/components/book/booking-request-form";
import type { PricingConfig } from "@/components/payment/price-breakdown";
import { homestayToday, isValidBookingKey } from "@/lib/booking-link";
import { getBookedRanges } from "@/lib/data/availability";
import { getPublicPaymentConfig } from "@/lib/data/payment-config";

export const metadata: Metadata = {
  title: "Book your stay — ACs Homestay",
  description: "Request dates for your stay at ACs Homestay.",
  // A private link — keep it out of search results.
  robots: { index: false, follow: false },
};

/**
 * The guests' booking page — the one page outside the access gate (see the
 * proxy matcher). It needs the link's secret key; with it, guests see which
 * nights are taken (dates only) and can send a request, which the owners
 * approve or decline in the app.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string | string[] }>;
}) {
  const { k } = await searchParams;
  const key = Array.isArray(k) ? k[0] : k;
  const valid = isValidBookingKey(key);
  const today = homestayToday();
  // Pricing lives in PaymentConfig too (alongside the bank fields) so it can
  // be edited from the same Settings page. Default to all-zeros when the row
  // hasn't been configured yet — PriceBreakdown hides itself in that state.
  const [booked, config] = await Promise.all([getBookedRanges(today), getPublicPaymentConfig()]);
  const pricing: PricingConfig = {
    nightlyRate: config?.nightlyRate ?? 0,
    cleaningFee: config?.cleaningFee ?? 0,
    cleaningFeeLong: config?.cleaningFeeLong ?? 0,
  };

  return (
    <div className="flex min-h-full flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-xl">
        <header className="mb-6 text-center">
          <Image
            src="/acshomestay_logo.jpg"
            alt="ACs Homestay"
            width={56}
            height={56}
            className="mx-auto h-14 w-14 rounded-full"
            priority
          />
          <h1 className="mt-3 text-xl font-semibold text-slate-900">Book your stay at ACs Homestay</h1>
          {valid ? (
            <p className="mt-1 text-sm text-slate-500">
              Pick your dates and tell us a little about your stay. We&apos;ll get back to you to
              confirm.
            </p>
          ) : null}
        </header>

        {valid && key ? (
          <BookingRequestForm linkKey={key} booked={booked} today={today} pricing={pricing} />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="font-medium text-slate-900">This booking link isn&apos;t valid.</p>
            <p className="mt-1 text-sm text-slate-500">
              It may be incomplete or out of date. Please ask us for a new link.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
