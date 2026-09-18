"use client";

import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { useStore } from "@/lib/store";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { ready: dataReady } = useStore();

  if (!dataReady) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
