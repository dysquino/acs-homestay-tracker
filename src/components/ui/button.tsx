import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-700 text-white hover:bg-brand-800 focus-visible:outline-brand-700",
  secondary:
    "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-slate-400",
  danger:
    "bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50 focus-visible:outline-red-500",
};

// On touch screens every button is at least 36px tall (and an icon-only one
// 36px wide), a comfortable size for a finger.
const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs gap-1 pointer-coarse:min-h-9 pointer-coarse:min-w-9",
  md: "px-3.5 py-2 text-sm gap-1.5 pointer-coarse:min-h-10",
};

const BASE =
  "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-50";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /**
   * Shows a spinner and blocks further clicks while a write is in flight.
   *
   * The button keeps its label, so the text still says what is happening
   * ("Saving…"), and `disabled` is applied on top of whatever the caller
   * asked for — a loading button never accepts a second click.
   */
  loading?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="-ml-0.5" /> : null}
      {children}
    </button>
  );
}

/** Same look as Button, but navigates. */
export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
}
