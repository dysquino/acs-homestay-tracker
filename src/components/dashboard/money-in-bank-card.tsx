import { Card, CardHeader } from "@/components/ui/card";
import { BankIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatCurrency, formatSigned } from "@/lib/format";
import type { MoneyInBank } from "@/lib/selectors";

/**
 * Money in the bank, worked out from the records: income from paid bookings
 * minus expenses already paid out. Unlike the Profit hero (booked income for
 * one month), it's an all-time running figure, so the month filter doesn't
 * apply to it. Laid out like the Money to settle card beside it.
 */
export function MoneyInBankCard({ result }: { result: MoneyInBank }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        icon={BankIcon}
        title="Money in the bank"
        description="All time · not affected by the month filter"
      />
      <div className="flex flex-1 flex-col px-4 pt-2 pb-5 sm:px-5">
        <Row
          label="Total income"
          detail={`${result.incomeCount} paid booking${result.incomeCount === 1 ? "" : "s"}`}
          amount={formatCurrency(result.income)}
        />
        <Row
          label="− Total expenses"
          detail={`${result.expenseCount} paid or refunded expense${result.expenseCount === 1 ? "" : "s"}`}
          amount={formatCurrency(result.spent)}
        />
        <div className="mt-auto rounded-2xl bg-brand-50 px-4 py-3">
          <p className="text-xs text-slate-500">= Money in the bank</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tracking-tight",
              result.balance < 0 ? "text-red-700" : "text-slate-900",
            )}
          >
            {formatSigned(result.balance)}
          </p>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, detail, amount }: { label: string; detail: string; amount: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
      </div>
      <p className="text-lg font-semibold tracking-tight whitespace-nowrap text-slate-900">{amount}</p>
    </div>
  );
}
