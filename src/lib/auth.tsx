"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import type { User } from "./types";
import { useClientState } from "./use-client-state";

/**
 * Placeholder auth for the frontend build.
 *
 * The real thing is Supabase Auth (email + password, five fixed accounts, no
 * public signup). Until that's wired up this recognises the five seeded
 * addresses and accepts any non-empty password, so the login gate and the
 * "who's signed in" plumbing can be built and tested now. Nothing here is a
 * security boundary — it just shapes the UI.
 */

const SESSION_KEY = "acs-homestay-tracker:session";

/** The five internally-created accounts. All have equal access. */
export const ACCOUNTS: User[] = [
  { id: "u_1", name: "Owner", email: "owner@acshomestay.ph" },
  { id: "u_2", name: "Manager", email: "manager@acshomestay.ph" },
  { id: "u_3", name: "Ana", email: "ana@acshomestay.ph" },
  { id: "u_4", name: "Carlo", email: "carlo@acshomestay.ph" },
  { id: "u_5", name: "Jen", email: "jen@acshomestay.ph" },
];

type AuthValue = {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => { ok: boolean; error?: string };
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

function loadSession(): User | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null; // Corrupt session — treat as signed out.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, ready, setUser] = useClientState<User | null>(loadSession, null);

  const signIn = useCallback((email: string, password: string) => {
    const match = ACCOUNTS.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!match) return { ok: false, error: "No account with that email." };
    if (!password) return { ok: false, error: "Enter your password." };

    window.localStorage.setItem(SESSION_KEY, JSON.stringify(match));
    setUser(match);
    return { ok: true };
  }, [setUser]);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, [setUser]);

  const value = useMemo<AuthValue>(
    () => ({ user, ready, signIn, signOut }),
    [user, ready, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
