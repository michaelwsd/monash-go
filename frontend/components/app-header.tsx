"use client";

import { LogOut, Sprout } from "lucide-react";
import { useClerk, useUser } from "@clerk/nextjs";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { label: "Find a ride", href: "/rides" },
  { label: "Post a drive", href: "/rides/new" },
  { label: "My trips", href: "/trips" },
];

/**
 * The header bar from artboard 1f: wordmark, section links, points badge, and
 * the avatar menu.
 *
 * A client component because signing out has to happen in the browser, where
 * the session lives. The nav links point at pages that do not exist yet, so
 * they are rendered as plain text rather than links - a link to a 404 is worse
 * than no link.
 */
export function AppHeader({ greenPoints }: { greenPoints: number }) {
  const { user } = useUser();
  const { signOut } = useClerk();

  const name = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "";
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";

  return (
    <header className="border-b bg-muted/40">
      <div className="mx-auto flex h-14 w-full max-w-[900px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-4 sm:gap-[18px]">
          <span className="text-[17px] font-semibold tracking-[-0.025em]">
            MonashGo
          </span>
          {/* Hidden below sm: at phone width the design uses a bottom tab bar
              (artboard 1d) rather than squeezing these in. */}
          <nav className="hidden items-center gap-[18px] sm:flex">
            {NAV.map((item) => (
              <span
                key={item.href}
                className="text-xs text-muted-foreground/70"
                title="Not built yet"
              >
                {item.label}
              </span>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-full font-medium">
            <Sprout className="size-3 text-eco" aria-hidden />
            {greenPoints.toLocaleString()}
            <span className="hidden sm:inline">pts</span>
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger
              className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Account menu"
            >
              <Avatar className="size-[26px]">
                <AvatarImage src={user?.imageUrl} alt="" />
                <AvatarFallback className="text-[10px]">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <span className="block text-xs font-medium">{name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {user?.primaryEmailAddress?.emailAddress}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void signOut({ redirectUrl: "/sign-in" })}
              >
                <LogOut aria-hidden />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
