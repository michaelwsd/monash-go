import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: ReactNode;
  /** One line under the title. Route, distance, "10.4 km · about 24 min". */
  subtitle?: ReactNode;
  /** Buttons or filters pinned to the right on wide screens. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The title block every screen opens with.
 *
 * Flush left with whitespace on the right, per the system's direction. On
 * narrow screens the actions drop below the title rather than squeezing it,
 * because the titles here are routes ("Clayton → Caulfield") that stop being
 * readable the moment they wrap mid-arrow.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-[32px]">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-ink/70">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
