"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import type { User } from "./types";
import { useClientState } from "./use-client-state";

/**
 * "Who's using this browser" — attribution only, not access control.
 *
 * The app used to gate itself behind a per-user login (see git history:
 * src/lib/auth.tsx). Now that a site-wide access code (src/proxy.ts) is
 * the actual gate, that per-user login added a screen without adding real
 * security — anyone past the access code could already pick any of the 5
 * names. This keeps just the useful part: a lightweight picker so
 * createdBy/paidBy still records who added a given record.
 */

const STORAGE_KEY = "acs-homestay-tracker:identity";

/** The five people who use this tracker. */
export const ACCOUNTS: User[] = [
  { id: "u_1", name: "Owner", email: "owner@acshomestay.ph" },
  { id: "u_2", name: "Manager", email: "manager@acshomestay.ph" },
  { id: "u_3", name: "Ana", email: "ana@acshomestay.ph" },
  { id: "u_4", name: "Carlo", email: "carlo@acshomestay.ph" },
  { id: "u_5", name: "Jen", email: "jen@acshomestay.ph" },
];

type IdentityValue = {
  user: User;
  ready: boolean;
  setUser: (user: User) => void;
};

const IdentityContext = createContext<IdentityValue | null>(null);

function loadIdentity(): User {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as User) : null;
    const match = saved && ACCOUNTS.find((a) => a.id === saved.id);
    return match ?? ACCOUNTS[0];
  } catch {
    return ACCOUNTS[0];
  }
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [user, ready, setUserState] = useClientState<User>(
    loadIdentity,
    ACCOUNTS[0],
  );

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }, [user, ready]);

  const setUser = useCallback(
    (next: User) => setUserState(next),
    [setUserState],
  );

  const value = useMemo<IdentityValue>(
    () => ({ user, ready, setUser }),
    [user, ready, setUser],
  );

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): IdentityValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity must be used inside <IdentityProvider>");
  return ctx;
}
