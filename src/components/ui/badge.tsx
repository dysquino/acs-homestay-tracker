import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type {
  BookingSource,
  CleaningPaymentStatus,
  CleaningStatus,
  PaymentStatus,
} from "@/lib/types";

type Tone =
  | "neutral"
  | "green"
  | "amber"
  | "red"
  | "airbnb"
  | "direct"
  | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  airbnb: "bg-airbnb-50 text-airbnb-700 ring-airbnb-200",
  direct: "bg-direct-50 text-direct-700 ring-direct-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SourceBadge({ source }: { source: BookingSource }) {
  return (
    <Badge tone={source === "airbnb" ? "airbnb" : "direct"}>
      {source === "airbnb" ? "Airbnb" : "Direct"}
    </Badge>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const tone = status === "paid" ? "green" : status === "partial" ? "amber" : "red";
  const label =
    status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Pending";
  return <Badge tone={tone}>{label}</Badge>;
}

export function CleaningStatusBadge({ status }: { status: CleaningStatus }) {
  return (
    <Badge tone={status === "completed" ? "green" : "brand"}>
      {status === "completed" ? "Completed" : "Scheduled"}
    </Badge>
  );
}

export function CleaningPaymentBadge({
  status,
}: {
  status: CleaningPaymentStatus;
}) {
  return (
    <Badge tone={status === "paid" ? "green" : "amber"}>
      {status === "paid" ? "Paid" : "Unpaid"}
    </Badge>
  );
}
