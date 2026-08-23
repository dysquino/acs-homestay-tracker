"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/app-shell";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { PlusIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/modal";
import { StatTile } from "@/components/ui/stat";
import { EmptyState, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { today } from "@/lib/dates";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { expensesByMonth, monthSummary } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import {
  EXPENSE_CATEGORIES,
  labelFor,
  type Expense,
  type ExpenseCategory,
} from "@/lib/types";

type SortKey = "date" | "amount" | "category";

export default function ExpensesPage() {
  const { expenses, bookings, deleteExpense } = useStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ExpenseCategory | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });

  const summary = useMemo(
    () => monthSummary(bookings, expenses, today()),
    [bookings, expenses],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (q && !`${e.description} ${e.paidBy}`.toLowerCase().includes(q))
        return false;
      if (category !== "all" && e.category !== category) return false;
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      return true;
    });
  }, [expenses, search, category, from, to]);

  const sorted = useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "amount") return (a.amount - b.amount) * factor;
      if (sort.key === "category")
        return a.category.localeCompare(b.category) * factor;
      return a.date.localeCompare(b.date) * factor;
    });
  }, [filtered, sort]);

  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0);
  const byMonth = useMemo(() => expensesByMonth(expenses), [expenses]);
  const filtersActive =
    search !== "" || category !== "all" || from !== "" || to !== "";

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

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatTile
          label={`Income — ${formatMonth(summary.month)}`}
          value={formatCurrency(summary.income)}
          hint="Net of platform fees"
          tone="brand"
        />
        <StatTile
          label={`Expenses — ${formatMonth(summary.month)}`}
          value={formatCurrency(summary.expenses)}
        />
        <StatTile
          label="Profit this month"
          value={formatCurrency(summary.net)}
          tone={summary.net >= 0 ? "positive" : "negative"}
          hint={summary.net >= 0 ? "In the black" : "Spending exceeds income"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="grid gap-2 border-b border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description or payer…"
              aria-label="Search expenses"
              className="lg:col-span-2"
            />
            <Select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as ExpenseCategory | "all")
              }
              aria-label="Filter by category"
            >
              <option value="all">All categories</option>
              {EXPENSE_CATEGORIES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From date"
              />
              <span className="text-xs text-slate-400">to</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To date"
              />
            </div>
            {filtersActive ? (
              <div className="sm:col-span-2 lg:col-span-4">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSearch("");
                    setCategory("all");
                    setFrom("");
                    setTo("");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : null}
          </div>

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
            <TableWrap>
              <Table>
                <thead>
                  <tr className="bg-slate-50">
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/70">
                      <Td className="whitespace-nowrap">{formatDate(e.date)}</Td>
                      <Td>
                        <Badge>
                          {labelFor(EXPENSE_CATEGORIES, e.category)}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="text-slate-900">{e.description}</span>
                      </Td>
                      <Td className="hidden text-slate-500 sm:table-cell">
                        {e.paidBy || "—"}
                      </Td>
                      <Td
                        align="right"
                        className="whitespace-nowrap font-medium text-slate-900"
                      >
                        {formatCurrency(e.amount)}
                      </Td>
                      <Td align="right">
                        <div className="flex justify-end gap-1 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(e);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setPendingDelete(e)}
                          >
                            Delete
                          </Button>
                        </div>
                      </Td>
                    </tr>
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
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader
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
        onConfirm={() => {
          if (pendingDelete) deleteExpense(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}
