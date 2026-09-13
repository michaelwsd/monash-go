"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, Car, Home, Route, Search } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { label: "Home", href: "/", icon: Home, exact: true },
  { label: "Find", href: "/rides", icon: Search, exact: true },
  { label: "Post", href: "/rides/new", icon: Car, exact: true },
  { label: "Trips", href: "/trips", icon: CalendarCheck, exact: false },
  { label: "Drives", href: "/drives", icon: Route, exact: false },
];

/**
 * The bottom tab bar from artboard 1d. Only rendered below `sm`, where the
 * header's nav links are hidden - without it the sections are unreachable on a
 * phone.
 *
 * `exact` matters for /rides against /rides/new: both start with /rides, and
 * only one of them should light up.
 */
export function MobileTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-[900px] grid-cols-5">
        {TABS.map(({ label, href, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors focus:outline-none focus-visible:bg-muted",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "text-eco")} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
