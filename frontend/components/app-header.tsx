"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Car, LogOut, Sprout, UserRound } from "lucide-react";
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

/* `built` is what decides between a link and inert text. A link to a 404 is
   worse than no link, so an unbuilt section stays greyed out until its page
   exists - flip the flag in the same commit that adds the route.

   My cars and Profile are deliberately absent: they are account settings, not
   sections of the app, so they live in the avatar menu with Sign out. */
const NAV = [
  { label: "Find a ride", href: "/rides", built: false },
  { label: "Post a drive", href: "/rides/new", built: false },
  { label: "My trips", href: "/trips", built: false },
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
  const pathname = usePathname();

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
            {NAV.map((item) =>
              item.built ? (
                <Link
                  key={item.href}
                  href={item.href}
                  // aria-current marks the section for a screen reader; the
                  // weight and colour do the same job for everyone else.
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={`rounded text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                    pathname === item.href
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.href}
                  className="text-xs text-muted-foreground/70"
                  title="Not built yet"
                >
                  {item.label}
                </span>
              ),
            )}
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
              {/* The only route to either page, at every width. */}
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <UserRound aria-hidden />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/vehicles">
                  <Car aria-hidden />
                  My cars
                </Link>
              </DropdownMenuItem>
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
