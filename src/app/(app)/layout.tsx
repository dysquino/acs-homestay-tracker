"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";

/**
 * Every page in this group is behind the login gate. Once Supabase Auth is in,
 * this check moves to middleware/server components — the client redirect here
 * is a stand-in, not a real guard.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, ready: authReady } = useAuth();
  const { ready: dataReady } = useStore();

  useEffect(() => {
    if (authReady && !user) router.replace("/login");
  }, [authReady, user, router]);

  if (!authReady || !user || !dataReady) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
