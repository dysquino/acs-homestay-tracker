"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/layout/app-shell";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ReimbursementPayout } from "@/components/expenses/reimbursement-payout";
import { ExpenseSettlements } from "@/components/expenses/expense-settlements";
import { Badge, RefundBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { ListIcon, PlusIcon } from "@/components/ui/icons";
import { HeaderAction, HeaderActions } from "@/components/ui/header-action";
import { PeriodPicker } from "@/components/ui/period-picker";
import { DetailSheet } from "@/components/ui/detail-sheet";
import { ConfirmDialog } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { StatTile } from "@/components/ui/stat";
import {
  CardList,
  CompactRow,
  EmptyState,
  GroupHeading,
  RowActions,
  RowTitle,
  Table,
  TableWrap,
  Td,
  Th,
  Thead,
  Tr,
} from "@/components/ui/table";
import { today } from "@/lib/dates";
import { formatCurrency, formatDate, formatMonth, formatWhole } from "@/lib/format";
import { inPeriod, periodLabel, periodRange, presetPeriod, type Period, type PresetKey } from "@/lib/period";
import { expensesByMonth, groupByDay, rangeSummary } from "@/lib/selectors";
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

const PERIOD_PRESETS: PresetKey[] = ["thisMonth", "lastMonth", "last3", "thisYear", "lastYear", "all"];

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
  const { expenses, bookings, deleteExpense, resync, reconciliationEnabled } = useStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  // Which expense has the reimbursement prompt open, if any.
  const [reimbursing, setReimbursing] = useState<Expense | null>(null);
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
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });

  const t = today();
  // The period the tiles and the list follow (◀ October 2026 ▾ ▶ in the
  // list's filter row). Arriving from the dashboard's "Refund <name>" starts on all time,
  // since unrefunded items can be older.
  const [period, setPeriod] = useState<Period>(() =>
    params.get("refund") || params.get("paidBy") ? { kind: "all" } : presetPeriod("thisMonth", t),
  );

  const summary = useMemo(() => {
    const { from, to } = periodRange(period, t);
    return rangeSummary(bookings, expenses, from, to);
  }, [bookings, expenses, period, t]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (!inPeriod(e.date, period, t)) return false;
      if (category !== "all" && e.category !== category) return false;
      if (refund !== "all" && e.refundStatus !== refund) return false;
      if (paidBy !== "all" && e.paidBy.trim() !== paidBy) return false;
      return true;
    });
  }, [expenses, period, t, category, refund, paidBy]);

  const sorted = useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "amount") return (a.amount - b.amount) * factor;
      if (sort.key === "category")
        return a.category.localeCompare(b.category) * factor;
      return a.date.localeCompare(b.date) * factor;
    });
  }, [filtered, sort]);
  const paging = usePagination(
    sorted,
    JSON.stringify([period, category, refund, paidBy, sort]),
  );
  // Day headings (phones/tablets) only make sense when the list is in date order.
  const dayGroups = sort.key === "date" ? groupByDay(paging.pageItems, sorted) : null;

  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0);
  const byMonth = useMemo(() => expensesByMonth(expenses), [expenses]);
  const filtersActive = category !== "all" || refund !== "all" || paidBy !== "all";
  // The fixed roster, plus any older name still on an expense.
  const payers = useMemo(
    () => [...new Set([...PAID_BY.map((p) => p.value), ...expenses.map((e) => e.paidBy.trim()).filter(Boolean)])],
    [expenses],
  );

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  }

  const dirFor = (key: SortKey) => (sort.key === key ? sort.dir : null);

  /**
   * Opens the payout prompt rather than writing. Reimbursing someone who
   * fronted the cost is a real movement of money, so it needs the date the
   * same way every other payout does — clearing the owed flag on its own left
   * the expense looking settled with no settlement behind it.
   */
  const markRefundedButton = (e: Expense) => (
    <Button
      size="sm"
      variant="ghost"
      className="text-emerald-700 hover:bg-emerald-50"
      onClick={() => setReimbursing(e)}
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
          <HeaderActions count={1}>
            <HeaderAction primary icon={PlusIcon} label="Add expense" onClick={openAdd} />
          </HeaderActions>
        }
      />

      {/* One row even on a phone (compact tiles). They follow the period
          picked in the list's filter row just below (named in the labels from
          sm up), like the Bookings and Cleaning lists. */}
      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile
          compact
          label={<>Income<span className="hidden sm:inline"> — {periodLabel(period)}</span></>}
          value={formatWhole(summary.income)}
          hint="Booking payouts, split by nights per month"
          tone="brand"
        />
        <StatTile
          compact
          label={<>Expenses<span className="hidden sm:inline"> — {periodLabel(period)}</span></>}
          value={formatWhole(summary.expenses)}
        />
        <StatTile
          compact
          label={<>Profit<span className="hidden sm:inline"> — {periodLabel(period)}</span></>}
          value={formatWhole(summary.net)}
          tone={summary.net >= 0 ? "positive" : "negative"}
          hint={summary.net >= 0 ? "In the black" : "Spending exceeds income"}
        />
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:items-start">
        {/* overflow-clip, not -hidden: hidden would stop the day headings sticking. */}
        <Card className="overflow-clip">
          <FilterBar
            filtersActive={filtersActive}
            activeCount={[category !== "all", refund !== "all", paidBy !== "all"].filter(Boolean).length}
            period={<PeriodPicker value={period} onChange={setPeriod} presets={PERIOD_PRESETS} />}
            onClear={() => {
              setCategory("all");
              setRefund("all");
              setPaidBy("all");
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
            </FilterBar>


          {sorted.length === 0 ? (
            <EmptyState
              title={filtersActive ? "No expenses match" : `No expenses in ${periodLabel(period)}`}
              message={
                filtersActive
                  ? "Try clearing the filters, or pick another period above."
                  : "Use the arrows or tap the period above to look elsewhere, or record an expense."
              }
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
                {(dayGroups ?? [{ date: "", items: paging.pageItems, count: 0, total: 0 }]).map((g) => [
                  dayGroups ? (
                    <GroupHeading
                      key={`day-${g.date}`}
                      title={formatDate(g.date)}
                      detail={`${g.count} expense${g.count === 1 ? "" : "s"}`}
                      amount={g.count > 1 ? formatCurrency(g.total) : undefined}
                    />
                  ) : null,
                  ...g.items.map((e) => (
                  <CompactRow
                    key={e.id}
                    onOpen={() => setSelected(e)}
                    title={e.description}
                    subtitle={
                      dayGroups
                        ? labelFor(EXPENSE_CATEGORIES, e.category)
                        : `${formatDate(e.date)} · ${labelFor(EXPENSE_CATEGORIES, e.category)}`
                    }
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
                  )),
                ])}
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

      <ReimbursementPayout
        open={reimbursing !== null}
        expense={reimbursing}
        onClose={() => setReimbursing(null)}
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
        body={
          selected && reconciliationEnabled ? (
            <ExpenseSettlements expense={selected} onChanged={resync} />
          ) : null
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
