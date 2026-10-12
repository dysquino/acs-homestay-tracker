"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import type { Paging } from "@/lib/use-pagination";

/**
 * Prev / next bar under a paged table. Renders nothing when everything fits
 * on one page. Changing page scrolls the table's card back into view when its
 * top has scrolled off-screen, so the new page starts at its first row.
 */
export function Pagination({ paging, noun }: { paging: Paging; noun: string }) {
  const ref = useRef<HTMLDivElement>(null);
  if (paging.pageCount <= 1) return null;

  function go(page: number) {
    paging.setPage(page);
    const card = ref.current?.closest("section");
    // Below lg a sticky top bar covers the top of the screen; its height is
    // the page's scroll-padding-top (globals.css), so count that as hidden.
    const covered = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    if (card && card.getBoundingClientRect().top < covered) card.scrollIntoView({ block: "start" });
  }

  return (
    <div
      ref={ref}
      className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-5"
    >
      <Button
        size="sm"
        onClick={() => go(paging.page - 1)}
        disabled={paging.page === 1}
        aria-label="Previous page"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Previous</span>
      </Button>
      <p className="text-center text-xs text-slate-600" aria-live="polite">
        <span className="font-medium text-slate-900">
          {paging.first}–{paging.last}
        </span>{" "}
        of {paging.total} {noun} · page {paging.page} of {paging.pageCount}
      </p>
      <Button
        size="sm"
        onClick={() => go(paging.page + 1)}
        disabled={paging.page === paging.pageCount}
        aria-label="Next page"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRightIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}
