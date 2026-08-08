import { Icon } from "@/components/ui";

import { NavLink } from "./nav-link";
import { MOBILE_NAV } from "./routes";

/**
 * The phone tab bar from wireframe 1d.
 *
 * Fixed to the bottom and hidden from `sm` up, where the header bar carries the
 * same destinations. The `(app)` layout reserves matching bottom padding on the
 * main element so the last card in a scrolling page is never trapped behind it.
 *
 * `pb-[env(safe-area-inset-bottom)]` keeps the row clear of the iOS home
 * indicator; without it the bottom third of each tap target is unreachable.
 */
export function MobileTabBar() {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-divider bg-ground/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {MOBILE_NAV.map((route) => (
          <li key={route.href} className="flex-1">
            <NavLink
              href={route.href}
              className="flex min-h-12 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold no-underline transition-colors duration-150"
              activeClassName="text-clay-700"
              inactiveClassName="text-ink/55"
            >
              <Icon as={route.icon} size={18} />
              {route.short}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
