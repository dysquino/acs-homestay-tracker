"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

import { unlockSite } from "./actions";

export function GateForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState(unlockSite, undefined);

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
            This is a private preview. Enter the shared access code to
            continue.
          </p>
        </div>

        <form
          action={action}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <input type="hidden" name="from" value={from} />
          <Field label="Access code" required error={state?.error}>
            {(id) => (
              <Input
                id={id}
                name="password"
                type="password"
                autoComplete="off"
                required
                autoFocus
              />
            )}
          </Field>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={pending}
          >
            {pending ? "Checking…" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
