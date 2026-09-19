"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { cn } from "@/lib/cn";
import {
  CalendarIcon,
  HomeIcon,
  ReceiptIcon,
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
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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
              </Link>
            );
          })}
        </nav>
        <p className="px-5 py-3 text-xs text-slate-400">v{APP_VERSION}</p>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print flex items-center justify-between gap-3 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)] lg:hidden">
        <Brand />
        <p className="text-xs text-slate-400">v{APP_VERSION}</p>
      </header>

      <main className="min-w-0 flex-1 pb-20 lg:pb-0">
        <div className="mx-auto w-full max-w-[88rem] px-4 py-5 sm:px-6 sm:py-7">
          {children}
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] lg:hidden">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                active ? "text-brand-700" : "text-slate-500",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.short}
            </Link>
          );
        })}
      </nav>
    </div>
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
      {action ? <div className="no-print shrink-0">{action}</div> : null}
    </div>
  );
}
