"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/layout/app-shell";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { Badge, RefundBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { DateRangeFilter, FilterBar } from "@/components/ui/filter-bar";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ListIcon,
  PlusIcon,
} from "@/components/ui/icons";
import { DetailSheet } from "@/components/ui/detail-sheet";
import { ConfirmDialog } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { StatTile } from "@/components/ui/stat";
import {
  CardList,
  CompactRow,
  EmptyState,
  RowActions,
  RowTitle,
  Table,
  TableWrap,
  Td,
  Th,
  Thead,
  Tr,
} from "@/components/ui/table";
import { addMonths, startOfMonth, today } from "@/lib/dates";
import { formatCurrency, formatDate, formatMonth, formatWhole } from "@/lib/format";
import { expensesByMonth, monthSummary } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import { usePagination } from "@/lib/use-pagination";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_REFUND_STATUSES,
  PAID_BY,
  labelFor,
  type Expense,
  type ExpenseCategory,
  type ExpenseRefundStatus,
} from "@/lib/types";

type SortKey = "date" | "amount" | "category";

/**
 * Accepts ?refund=owed&paidBy=<name> (the dashboard's "Refund <name>" action)
 * as the starting filters. Reading the URL needs a Suspense boundary here.
 */
export default function ExpensesPage() {
  return (
    <Suspense fallback={null}>
      <ExpensesPageContent />
    </Suspense>
  );
}

function ExpensesPageContent() {
  const params = useSearchParams();
  const { expenses, bookings, deleteExpense, updateExpense } = useStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  // The expense whose details are open; looked up fresh so an edit shows.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = expenses.find((e) => e.id === selectedId) ?? null;
  const setSelected = (e: Expense | null) => setSelectedId(e?.id ?? null);

  const [category, setCategory] = useState<ExpenseCategory | "all">("all");
  const [refund, setRefund] = useState<ExpenseRefundStatus | "all">(() => {
    const r = params.get("refund");
    return r === "owed" || r === "refunded" ? r : "all";
  });
  const [paidBy, setPaidBy] = useState(() => params.get("paidBy") ?? "all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });

  const t = today();
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(t));
  const isCurrentMonth = monthCursor === startOfMonth(t);

  const summary = useMemo(
    () => monthSummary(bookings, expenses, monthCursor),
    [bookings, expenses, monthCursor],
  );

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (refund !== "all" && e.refundStatus !== refund) return false;
      if (paidBy !== "all" && e.paidBy.trim() !== paidBy) return false;
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      return true;
    });
  }, [expenses, category, refund, paidBy, from, to]);

  const sorted = useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "amount") return (a.amount - b.amount) * factor;
      if (sort.key === "category")
        return a.category.localeCompare(b.category) * factor;
      return a.date.localeCompare(b.date) * factor;
    });
  }, [filtered, sort]);
  const paging = usePagination(sorted, JSON.stringify([category, refund, paidBy, from, to, sort]));

  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0);
  const byMonth = useMemo(() => expensesByMonth(expenses), [expenses]);
  const filtersActive = category !== "all" || refund !== "all" || paidBy !== "all" || from !== "" || to !== "";
  // The fixed roster, plus any older name still on an expense.
  const payers = useMemo(
    () => [...new Set([...PAID_BY.map((p) => p.value), ...expenses.map((e) => e.paidBy.trim()).filter(Boolean)])],
    [expenses],
  );

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  async function markRefunded(expense: Expense) {
    try {
      await updateExpense(expense.id, { refundStatus: "refunded" });
    } catch {
      alert("Couldn't update this expense. Please try again.");
    }
  }

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  }

  const dirFor = (key: SortKey) => (sort.key === key ? sort.dir : null);

  const markRefundedButton = (e: Expense) => (
    <Button
      size="sm"
      variant="ghost"
      className="text-emerald-700 hover:bg-emerald-50"
      onClick={() => markRefunded(e)}
    >
      Mark refunded
    </Button>
  );

  /** Expenses created for a paid cleaning are managed from the Cleaning page. */
  const rowActions = (e: Expense) =>
    e.cleaningId ? (
      <Link
        href="/cleaning"
        title="Created automatically when the cleaning was marked paid. Change it on the Cleaning page."
        className="inline-flex justify-end text-xs font-medium whitespace-nowrap text-brand-700 hover:underline"
      >
        From cleaning
      </Link>
    ) : (
      <RowActions
        onEdit={() => {
          setEditing(e);
          setFormOpen(true);
        }}
        onDelete={() => setPendingDelete(e)}
        extra={
          e.refundStatus === "owed" ? <span className="mr-1">{markRefundedButton(e)}</span> : undefined
        }
      />
    );

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Bills, dues, repairs, supplies, and cleaning payments."
        action={
          <Button variant="primary" onClick={openAdd}>
            <PlusIcon className="h-4 w-4" />
            Add expense
          </Button>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <Button
          size="sm"
          aria-label="Previous month"
          onClick={() => setMonthCursor((m) => addMonths(m, -1))}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          aria-label="Next month"
          onClick={() => setMonthCursor((m) => addMonths(m, 1))}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
        {!isCurrentMonth ? (
          <Button size="sm" onClick={() => setMonthCursor(startOfMonth(t))}>
            This month
          </Button>
        ) : null}
        <h2 className="ml-1 text-sm font-semibold text-slate-900">
          {formatMonth(monthCursor)}
        </h2>
      </div>

      {/* One row even on a phone (compact tiles); the month is in the selector
          right above, so phones drop it from the labels. */}
      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile
          compact
          label={<>Income<span className="hidden sm:inline"> — {formatMonth(summary.month)}</span></>}
          value={formatWhole(summary.income)}
          hint="Booking payouts, split by nights per month"
          tone="brand"
        />
        <StatTile
          compact
          label={<>Expenses<span className="hidden sm:inline"> — {formatMonth(summary.month)}</span></>}
          value={formatWhole(summary.expenses)}
        />
        <StatTile
          compact
          label={<>Profit<span className="hidden sm:inline"> — {formatMonth(summary.month)}</span></>}
          value={formatWhole(summary.net)}
          tone={summary.net >= 0 ? "positive" : "negative"}
          hint={summary.net >= 0 ? "In the black" : "Spending exceeds income"}
        />
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:items-start">
        <Card className="overflow-hidden">
          <FilterBar
            filtersActive={filtersActive}
            activeCount={[category !== "all", refund !== "all", paidBy !== "all", from, to].filter(Boolean).length}
            onClear={() => {
              setCategory("all");
              setRefund("all");
              setPaidBy("all");
              setFrom("");
              setTo("");
            }}
          >
              <Field label="Category" className="min-w-40 flex-1">
                {(id) => (
                  <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory | "all")}>
                    <option value="all">All categories</option>
                    {EXPENSE_CATEGORIES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Refund status" className="min-w-40 flex-1">
                {(id) => (
                  <Select id={id} value={refund} onChange={(e) => setRefund(e.target.value as ExpenseRefundStatus | "all")}>
                    <option value="all">Any refund status</option>
                    {EXPENSE_REFUND_STATUSES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Paid by" className="min-w-36 flex-1">
                {(id) => (
                  <Select id={id} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                    <option value="all">Anyone</option>
                    {payers.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            </FilterBar>

          {sorted.length === 0 ? (
            <EmptyState
              title="No expenses match"
              message="Try clearing the filters, or record the first expense."
              action={
                <Button variant="primary" onClick={openAdd}>
                  <PlusIcon className="h-4 w-4" />
                  Add expense
                </Button>
              }
            />
          ) : (
            <>
              <CardList>
                {paging.pageItems.map((e) => (
                  <CompactRow
                    key={e.id}
                    onOpen={() => setSelected(e)}
                    title={e.description}
                    subtitle={`${formatDate(e.date)} · ${labelFor(EXPENSE_CATEGORIES, e.category)}`}
                    amount={formatCurrency(e.amount)}
                    tags={
                      e.cleaningId ? (
                        <Badge>From cleaning</Badge>
                      ) : e.refundStatus === "owed" ? (
                        <RefundBadge status={e.refundStatus} />
                      ) : null
                    }
                    action={
                      !e.cleaningId && e.refundStatus === "owed" ? markRefundedButton(e) : null
                    }
                  />
                ))}
                <li className="flex items-baseline justify-between gap-3 bg-slate-50 px-4 py-2.5 text-sm">
                  <span className="font-medium text-slate-700">
                    {filtered.length} shown
                  </span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(filteredTotal)}
                  </span>
                </li>
              </CardList>

              <TableWrap>
              <Table>
                <Thead>
                  <Th onClick={() => toggleSort("date")} sort={dirFor("date")}>
                    Date
                  </Th>
                  <Th
                    onClick={() => toggleSort("category")}
                    sort={dirFor("category")}
                  >
                    Category
                  </Th>
                  <Th>Description</Th>
                  <Th className="hidden sm:table-cell">Paid by</Th>
                  <Th
                    align="right"
                    onClick={() => toggleSort("amount")}
                    sort={dirFor("amount")}
                  >
                    Amount
                  </Th>
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </Thead>
                <tbody className="divide-y divide-slate-100">
                  {paging.pageItems.map((e) => (
                    <Tr key={e.id}>
                      <Td className="whitespace-nowrap">{formatDate(e.date)}</Td>
                      <Td>
                        <Badge>
                          {labelFor(EXPENSE_CATEGORIES, e.category)}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="block max-w-[13rem] truncate" title={e.description}>
                          <RowTitle onOpen={() => setSelected(e)}>{e.description}</RowTitle>
                        </span>
                      </Td>
                      <Td className="hidden text-slate-500 sm:table-cell">
                        {e.paidBy ? (
                          <span className="inline-flex items-center gap-1.5">
                            {e.paidBy}
                            <RefundBadge status={e.refundStatus} />
                          </span>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td
                        align="right"
                        className="whitespace-nowrap font-medium text-slate-900"
                      >
                        {formatCurrency(e.amount)}
                      </Td>
                      <Td align="right">{rowActions(e)}</Td>
                    </Tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <Td className="font-medium text-slate-700">
                      {filtered.length} shown
                    </Td>
                    <Td className="hidden sm:table-cell">{null}</Td>
                    <Td>{null}</Td>
                    <Td className="hidden sm:table-cell">{null}</Td>
                    <Td
                      align="right"
                      className="whitespace-nowrap font-semibold text-slate-900"
                    >
                      {formatCurrency(filteredTotal)}
                    </Td>
                    <Td>{null}</Td>
                  </tr>
                </tfoot>
              </Table>
              </TableWrap>
              <Pagination paging={paging} noun="expenses" />
            </>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader
            icon={ListIcon}
            title="Monthly totals"
            description="Every month with recorded expenses."
          />
          {byMonth.length === 0 ? (
            <EmptyState title="Nothing recorded yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {byMonth.map((m) => (
                <li
                  key={m.month}
                  className="flex items-baseline justify-between gap-3 px-4 py-2.5 sm:px-5"
                >
                  <div>
                    <p className="text-sm text-slate-900">
                      {formatMonth(`${m.month}-01`)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {m.count} item{m.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums text-slate-900">
                    {formatCurrency(m.total)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ExpenseForm
        open={formOpen}
        expense={editing}
        onClose={() => setFormOpen(false)}
      />

      <DetailSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.description ?? ""}
        tags={
          selected ? (
            <>
              <Badge>{labelFor(EXPENSE_CATEGORIES, selected.category)}</Badge>
              {selected.cleaningId ? <Badge>From cleaning</Badge> : null}
            </>
          ) : null
        }
        fields={
          selected
            ? [
                { label: "Date", value: formatDate(selected.date) },
                { label: "Amount", value: <span className="font-semibold">{formatCurrency(selected.amount)}</span> },
                { label: "Paid by", value: selected.paidBy || <span className="text-slate-400">—</span> },
                {
                  label: "Refund status",
                  // The badge only marks the exception (owed); here it's spelled out either way.
                  value:
                    selected.refundStatus === "owed" ? (
                      <RefundBadge status={selected.refundStatus} />
                    ) : (
                      labelFor(EXPENSE_REFUND_STATUSES, selected.refundStatus)
                    ),
                },
                { label: "Added by", value: selected.createdBy },
              ]
            : []
        }
        note={
          selected?.cleaningId ? (
            <>
              Created automatically when the cleaning was marked paid — change it on the{" "}
              <Link href="/cleaning" className="font-medium text-brand-700 hover:underline">
                Cleaning page
              </Link>
              .
            </>
          ) : undefined
        }
        actions={
          selected && !selected.cleaningId && selected.refundStatus === "owed"
            ? markRefundedButton(selected)
            : undefined
        }
        onEdit={
          selected && !selected.cleaningId
            ? () => {
                setEditing(selected);
                setSelected(null);
                setFormOpen(true);
              }
            : undefined
        }
        onDelete={
          selected && !selected.cleaningId
            ? () => {
                setPendingDelete(selected);
                setSelected(null);
              }
            : undefined
        }
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete expense?"
        message={
          pendingDelete ? (
            <>
              <strong>{pendingDelete.description}</strong> —{" "}
              {formatCurrency(pendingDelete.amount)} on{" "}
              {formatDate(pendingDelete.date)}. This can&apos;t be undone.
            </>
          ) : null
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          try {
            await deleteExpense(target.id);
          } catch {
            alert("Couldn't delete this expense. Please try again.");
          }
        }}
      />
    </>
  );
}
