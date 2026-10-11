import { useState } from "react";

export const PAGE_SIZE = 25;

/**
 * Client-side paging for a table's (already filtered and sorted) rows.
 *
 * `resetKey` should change whenever the filters or sort change — that sends
 * the table back to page 1. It's deliberately NOT the rows array itself:
 * every edit refetches the data (a new array), and marking an expense
 * refunded on page 3 shouldn't throw you back to page 1. The page is clamped
 * instead, so deleting the last row of the last page lands on the one before.
 */
export function usePagination<T>(items: T[], resetKey: string, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    // Adjusting state during render (not in an effect) avoids a flash of the
    // old page: https://react.dev/learn/you-might-not-need-an-effect
    setKey(resetKey);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;

  return {
    page: current,
    pageCount,
    pageItems: items.slice(start, start + pageSize),
    /** 1-based positions of the first and last row shown, for "26–50 of 97". */
    first: items.length === 0 ? 0 : start + 1,
    last: Math.min(start + pageSize, items.length),
    total: items.length,
    setPage,
  };
}

export type Paging = ReturnType<typeof usePagination>;
