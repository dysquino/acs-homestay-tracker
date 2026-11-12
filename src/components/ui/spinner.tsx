import { cn } from "@/lib/cn";

/**
 * A small spinning ring — the app's "this is working" sign.
 *
 * Every write in this app goes to the server and back, which on a phone
 * connection can take a couple of seconds. A button that just sits there
 * looking clickable invites a second tap (and a double booking, a duplicate
 * expense, a second delete). The spinner says "already on it" without
 * changing the button's size, so the layout doesn't jump.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-4 w-4 shrink-0 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Working"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
