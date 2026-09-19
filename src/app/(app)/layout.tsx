"use client";

import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { WarningIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { ready, loadError, reload, syncError, resync } = useStore();

  if (loadError) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-slate-900">
          Couldn&apos;t load your data.
        </p>
        <p className="max-w-sm text-sm text-slate-500">
          Check your connection and try again. Nothing has been lost.
        </p>
        <Button variant="primary" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <AppShell>
      {syncError ? (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <WarningIcon className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="flex-1">
            Your last change was saved, but the screen couldn&apos;t refresh, so
            it may be out of date.
          </span>
          <Button size="sm" onClick={() => void resync()}>
            Refresh
          </Button>
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
