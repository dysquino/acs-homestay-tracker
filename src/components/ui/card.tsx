import type { ComponentType, ReactNode, SVGProps } from "react";

import { cn } from "@/lib/cn";

/** Soft, diffuse elevation — shared by Card and StatTile for a consistent
 * "lifted" feel (borrowed from the reference dashboard's card styling,
 * recolored/kept neutral rather than copying its green). */
export const SOFT_SHADOW = "shadow-[0_2px_8px_rgba(15,23,42,0.06)]";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200 bg-white",
        SOFT_SHADOW,
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Small icon badge shown before the title, matching the reference
   * dashboard's icon-accented card headers. */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-4 py-4 sm:px-5", className)}>{children}</div>;
}
