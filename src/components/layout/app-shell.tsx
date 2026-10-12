"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ComponentType, type ReactNode, type SVGProps } from "react";

import { cn } from "@/lib/cn";
import { ACCOUNTS, useIdentity } from "@/lib/identity";
import { useStore } from "@/lib/store";
import {
  CalendarIcon,
  DownloadIcon,
  HomeIcon,
  ReceiptIcon,
  SettingsIcon,
  SparklesIcon,
} from "@/components/ui/icons";
import packageJson from "../../../package.json";

const APP_VERSION = packageJson.version;

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Home", icon: HomeIcon },
  { href: "/bookings", label: "Bookings", short: "Bookings", icon: CalendarIcon },
  { href: "/expenses", label: "Expenses", short: "Expenses", icon: ReceiptIcon },
  { href: "/cleaning", label: "Cleaning", short: "Cleaning", icon: SparklesIcon },
  { href: "/payment-settings", label: "Settings", short: "Settings", icon: SettingsIcon },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Guests' booking requests waiting for a reply — shown on the Bookings tab.
  const requests = useStore().bookingRequests.length;
  const badge = (href: string) =>
    href === "/bookings" && requests > 0 ? (
      <span
        aria-label={`${requests} new booking request${requests === 1 ? "" : "s"}`}
        className="ml-auto min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] leading-5 font-semibold text-white"
      >
        {requests}
      </span>
    ) : null;

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Desktop sidebar — sticky so navigation stays reachable while a
          long list (e.g. bookings) scrolls, instead of scrolling away
          with the page. */}
      <aside className="no-print hidden w-56 shrink-0 self-start rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)] lg:sticky lg:top-4 lg:m-4 lg:mr-0 lg:flex lg:h-[calc(100vh-2rem)] lg:flex-col">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-700 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <item.icon className="h-4.5 w-4.5" />
                {item.label}
                {badge(item.href)}
              </Link>
            );
          })}
        </nav>
        <div className="px-3">
          <ExportMenu />
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3">
          <IdentityPicker />
          <p className="text-xs text-slate-400">v{APP_VERSION}</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print flex items-center justify-between gap-3 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)] lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <ExportMenu compact />
          <IdentityPicker />
        </div>
      </header>

      <main className="min-w-0 flex-1 pb-20 lg:pb-0">
        <div className="mx-auto w-full max-w-[88rem] px-4 py-5 sm:px-6 sm:py-7">
          {children}
        </div>
      </main>

      {/* Mobile bottom tabs. Sized generously so tappability matches app nav
          expectations — bumped from 11px text + 20px icons to 12px + 24px
          after the home-screen icon felt undersized next to the rest of an
          app-style layout. The grid-cols-5 + ~74px per cell still leaves
          room for the longest label ("Cleaning", 8 chars) without wrap on
          320px-wide screens. */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] lg:hidden">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-xs font-medium",
                active ? "text-brand-700" : "text-slate-500",
              )}
            >
              <span className="relative">
                <item.icon className="h-6 w-6" />
                {badge(item.href) ? (
                  <span className="absolute -top-1.5 -right-2.5">{badge(item.href)}</span>
                ) : null}
              </span>
              {item.short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

const EXPORTS: { table: string; label: string }[] = [
  { table: "bookings", label: "Bookings" },
  { table: "expenses", label: "Expenses" },
  { table: "cleaning", label: "Cleaning" },
];

/**
 * CSV backups of each table — a standalone copy, independent of this app
 * still running (the lesson from the database going unreachable for 11
 * days). Tucked into the sidebar / mobile top bar rather than a dashboard
 * panel, since it's an occasional chore. A native <details> keeps it
 * keyboard-accessible without custom menu logic. `compact` is the mobile
 * top bar's icon-only version, opening as a dropdown.
 */
function ExportMenu({ compact }: { compact?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");

  return (
    <details ref={ref} className={cn("group", compact && "relative")}>
      <summary
        aria-label={compact ? "Export data" : undefined}
        className={cn(
          "flex cursor-pointer list-none items-center gap-2.5 rounded-full text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 [&::-webkit-details-marker]:hidden",
          compact ? "h-10 w-10 justify-center" : "px-3.5 py-2.5",
        )}
      >
        <DownloadIcon className={compact ? "h-5 w-5" : "h-4.5 w-4.5"} />
        {compact ? null : "Export data"}
      </summary>
      <div
        className={cn(
          compact
            ? "absolute right-0 z-50 mt-1 w-56 rounded-2xl bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.16)]"
            : "pb-1 pl-9",
        )}
      >
        {compact ? (
          <p className="px-2 pt-1 pb-1.5 text-xs text-slate-500">Download a CSV backup</p>
        ) : null}
        {EXPORTS.map((e) => (
          <a
            key={e.table}
            href={`/api/export/${e.table}`}
            download
            onClick={close}
            className="block rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 pointer-coarse:py-2.5"
          >
            {e.label} (.csv)
          </a>
        ))}
      </div>
    </details>
  );
}

/**
 * Who's using this browser — attribution only (see identity.tsx), not
 * access control. A plain <select> so it's keyboard- and screen-reader-
 * accessible without menu/click-outside logic, styled to sit quietly next
 * to the version tag rather than look like a form field.
 */
function IdentityPicker() {
  const { user, ready, setUser } = useIdentity();
  if (!ready) return null;

  return (
    <label className="flex min-w-0 items-center gap-1.5">
      <span className="sr-only">Recording changes as</span>
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-800"
      >
        {user.name.charAt(0).toUpperCase()}
      </span>
      <select
        value={user.id}
        onChange={(e) => {
          const next = ACCOUNTS.find((a) => a.id === e.target.value);
          if (next) setUser(next);
        }}
        className="min-w-0 max-w-24 truncate rounded-md border-0 bg-transparent py-0.5 text-xs font-medium pointer-coarse:py-2 pointer-coarse:text-base text-slate-600 focus-visible:outline-2 focus-visible:outline-slate-400"
      >
        {ACCOUNTS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <Image
        src="/acshomestay_logo.jpg"
        alt="ACs Homestay"
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-full"
      />
      <span className="text-sm leading-tight font-semibold text-slate-900">
        ACs Homestay
        <span className="block text-xs font-normal text-slate-500">
          Tracker
        </span>
      </span>
    </Link>
  );
}

/** Standard page heading used by every module page. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {/* Allowed to shrink so its buttons wrap onto a new line on a phone —
          `shrink-0` kept a row of three buttons wider than the screen, which
          made the whole page scroll sideways. */}
      {action ? <div className="no-print min-w-0 max-w-full">{action}</div> : null}
    </div>
  );
}
