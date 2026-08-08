"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Whether `href` names the section the user is currently in.
 *
 * Prefix matching, not equality, so `/rides/ride-1` keeps "Find a ride" lit.
 * The boundary check stops `/pet` from matching a hypothetical `/petrol`.
 */
export function isActiveSection(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface NavLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
}

/**
 * A link that knows whether it is the current section.
 *
 * This is the only client component in the shell. Keeping `usePathname` here
 * rather than in `TopNav` means the header, the brand and the points badge all
 * stay server-rendered, and the JavaScript shipped for navigation is a few
 * hundred bytes rather than the whole bar.
 */
export function NavLink({
  href,
  children,
  className,
  activeClassName,
  inactiveClassName,
}: NavLinkProps) {
  const pathname = usePathname();
  const active = isActiveSection(pathname, href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(className, active ? activeClassName : inactiveClassName)}
    >
      {children}
    </Link>
  );
}
