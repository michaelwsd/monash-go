import Link from "next/link";
import { Leaf } from "lucide-react";

import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPoints } from "@/lib/format";

import { ROUTES } from "./routes";

interface PointsBadgeProps {
  points: number;
  className?: string;
}

/**
 * The green-points chip in the header.
 *
 * A link, not a label. Per the wireframes the pet was demoted from a dashboard
 * card to a badge in the nav, which makes this chip the only route to the
 * rewards page — so it has to be reachable by keyboard and announce where it
 * goes, hence the visually hidden suffix rather than a bare number.
 */
export function PointsBadge({ points, className }: PointsBadgeProps) {
  return (
    <Link
      href={ROUTES.pet.href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1",
        "bg-sage-100 text-sage-800 text-xs font-semibold whitespace-nowrap no-underline",
        "transition-colors duration-150 hover:bg-sage-200",
        className,
      )}
    >
      <Icon as={Leaf} size={13} />
      {formatPoints(points)}
      <span className="sr-only"> green points — open your pet</span>
      <span aria-hidden className="hidden sm:inline">
        pts
      </span>
    </Link>
  );
}
