import Link from "next/link";

import { Avatar } from "@/components/ui";

import { NavLink } from "./nav-link";
import { PointsBadge } from "./points-badge";
import { PRIMARY_NAV, ROUTES } from "./routes";

interface TopNavProps {
  userName: string;
  avatarUrl: string | null;
  greenPoints: number;
}

/**
 * The header bar.
 *
 * The wireframes draw a 2px ink rule under it. Organic's `.nav` has
 * `border-bottom: none` and separates the bar by whitespace instead, so the
 * rule becomes a hairline divider — present enough to anchor the bar when the
 * page scrolls under it, quiet enough not to be the sharp geometry the system
 * rules out.
 *
 * The destination links are hidden below `sm`, where `MobileTabBar` takes over.
 * The brand and the points badge stay at every width.
 */
export function TopNav({ userName, avatarUrl, greenPoints }: TopNavProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-divider bg-ground/90 backdrop-blur-sm">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-[1120px] items-center gap-4 px-4 py-3 sm:gap-6"
      >
        <Link
          href={ROUTES.home.href}
          className="font-display text-lg leading-none no-underline text-ink"
        >
          MonashGo
        </Link>

        <ul className="hidden items-center gap-5 sm:flex">
          {PRIMARY_NAV.map((route) => (
            <li key={route.href}>
              <NavLink
                href={route.href}
                className="text-sm no-underline transition-colors duration-150"
                activeClassName="text-clay-700 font-semibold"
                inactiveClassName="text-ink/65 hover:text-clay-700"
              >
                {route.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <PointsBadge points={greenPoints} />
          <Link href={ROUTES.profile.href} aria-label={`${userName} — profile`}>
            <Avatar name={userName} src={avatarUrl} size="md" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
