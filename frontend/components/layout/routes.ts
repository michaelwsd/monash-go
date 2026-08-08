import { CarFront, House, PawPrint, Route, Ticket, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavRoute {
  href: string;
  /** Full label, used in the desktop bar. */
  label: string;
  /** Short label for the mobile tab bar, where five items share the width. */
  short: string;
  icon: LucideIcon;
}

/**
 * One route table for both navigations.
 *
 * The desktop bar and the mobile tab bar show different subsets of the same
 * list, so they are derived from a single source rather than written twice —
 * otherwise a new screen reliably gets added to one and forgotten in the other.
 */
export const ROUTES = {
  home: { href: "/home", label: "Home", short: "Home", icon: House },
  rides: { href: "/rides", label: "Find a ride", short: "Find", icon: Route },
  post: { href: "/post", label: "Post a drive", short: "Post", icon: CarFront },
  trips: { href: "/trips", label: "My trips", short: "Trips", icon: Ticket },
  pet: { href: "/pet", label: "Your pet", short: "Pet", icon: PawPrint },
  profile: { href: "/profile", label: "Profile", short: "Me", icon: User },
} as const satisfies Record<string, NavRoute>;

/** The wireframes' desktop bar: three destinations beside the brand. */
export const PRIMARY_NAV: NavRoute[] = [ROUTES.rides, ROUTES.post, ROUTES.trips];

/** The wireframes' mobile tab bar: five tap targets, home reached via the brand. */
export const MOBILE_NAV: NavRoute[] = [
  ROUTES.rides,
  ROUTES.post,
  ROUTES.trips,
  ROUTES.pet,
  ROUTES.profile,
];
