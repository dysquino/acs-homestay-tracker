"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import { PAID_BY, type User } from "./types";
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

/**
 * The five people who use this tracker — the owners of the unit, and the
 * same roster as PAID_BY (types.ts). Built from it, not listed twice, so
 * the two can never drift apart.
 */
export const ACCOUNTS: User[] = PAID_BY.map((p, i) => ({
  id: `u_${i + 1}`,
  name: p.value,
  email: `${p.value.toLowerCase()}@acshomestay.ph`,
}));

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
