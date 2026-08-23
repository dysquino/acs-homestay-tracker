"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ACCOUNTS, useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { user, ready, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = signIn(email, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace("/");
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-base font-bold text-white">
            AC
          </span>
          <h1 className="mt-3 text-lg font-semibold text-slate-900">
            ACs Homestay Tracker
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to manage bookings, expenses, and cleaning.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <Field label="Email" required>
            {(id) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(undefined);
                }}
                placeholder="owner@acshomestay.ph"
              />
            )}
          </Field>

          <Field label="Password" required error={error}>
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(undefined);
                }}
              />
            )}
          </Field>

          <Button type="submit" variant="primary" className="w-full">
            Sign in
          </Button>
        </form>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-medium">Frontend preview — auth is not real yet.</p>
          <p className="mt-1">
            Supabase Auth comes with the backend. For now, sign in with any of
            the seeded accounts and any password:
          </p>
          <ul className="mt-1.5 space-y-0.5 font-mono">
            {ACCOUNTS.map((a) => (
              <li key={a.id}>{a.email}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
