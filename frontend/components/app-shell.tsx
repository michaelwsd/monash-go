"use client";

import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { MobileTabs } from "@/components/mobile-tabs";
import { useCurrentUser } from "@/lib/use-current-user";

/**
 * Header, page title, content column, and the phone tab bar - the frame every
 * signed-in page sits in.
 *
 * The points badge in the header comes from our own users row, which the shell
 * fetches once here rather than every page fetching it for the same purpose.
 *
 * Bottom padding below `sm` clears the fixed tab bar, so the last card is never
 * hidden behind it.
 */
export function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { user } = useCurrentUser();

  return (
    <div className="flex flex-1 flex-col bg-muted/40 pb-16 sm:pb-0">
      <AppHeader greenPoints={user?.green_points ?? 0} />

      <main className="mx-auto w-full max-w-[900px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
        {title && (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-[-0.025em]">{title}</h1>
              {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}
        {children}
      </main>

      <MobileTabs />
    </div>
  );
}
