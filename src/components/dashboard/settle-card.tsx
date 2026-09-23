import Link from "next/link";

import { Card, CardHeader } from "@/components/ui/card";
import { ReceiptIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatCurrency, formatSigned } from "@/lib/format";

/**
 * Money still to move: what guests owe you, what you owe cleaners, and what
 * you owe whoever fronted cash for an expense — on one shared scale so the
 * bars compare honestly. Same hue-per-meaning as the cash-flow chart — money
 * in is amber, money out (to a cleaner or a payer) is blue.
 */

const IN = "#d97706";
const OUT = "#2a78d6";

type Props = {
  toCollect: number;
  collectCount: number;
  toPay: number;
  payCount: number;
  toRefund: number;
  refundCount: number;
};

export function SettleCard({
  toCollect,
  collectCount,
  toPay,
  payCount,
  toRefund,
  refundCount,
}: Props) {
  const scale = Math.max(toCollect, toPay, toRefund);
  const net = toCollect - toPay - toRefund;

  return (
    <Card className="h-full">
      <CardHeader icon={ReceiptIcon} title="Money to settle" description="Outstanding right now" />
      <div className="px-4 pt-2 pb-5 sm:px-5">
        {scale === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Everything is settled. Nothing to collect, pay, or refund.
          </p>
        ) : (
          <>
            <Row
              href="/bookings"
              label="Guests still owe you"
              detail={`${collectCount} booking${collectCount === 1 ? "" : "s"}`}
              amount={toCollect}
              scale={scale}
              color={IN}
            />
            <Row
              href="/cleaning"
              label="You owe cleaners"
              detail={`${payCount} cleaning${payCount === 1 ? "" : "s"}`}
              amount={toPay}
              scale={scale}
              color={OUT}
            />
            <Row
              href="/expenses"
              label="Owed for expenses"
              detail={`${refundCount} expense${refundCount === 1 ? "" : "s"} not yet refunded`}
              amount={toRefund}
              scale={scale}
              color={OUT}
            />
            <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500">Net once settled</span>
              <span
                className={cn(
                  "text-lg font-semibold tracking-tight",
                  net < 0 ? "text-red-700" : "text-slate-900",
                )}
              >
                {net > 0 ? "+" : ""}
                {formatSigned(net)}
              </span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function Row({
  href,
  label,
  detail,
  amount,
  scale,
  color,
}: {
  href: string;
  label: string;
  detail: string;
  amount: number;
  scale: number;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="-mx-2 mb-2 block rounded-2xl px-2 py-2.5 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-400"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-slate-900">{label}</span>
        <span className="text-lg font-semibold tracking-tight text-slate-900">
          {formatCurrency(amount)}
        </span>
      </div>
      <div className="mt-2 h-2.5 rounded-r-[4px] bg-slate-100">
        <div
          className="h-full rounded-r-[4px]"
          style={{ width: `${(amount / scale) * 100}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{detail}</p>
    </Link>
  );
}
