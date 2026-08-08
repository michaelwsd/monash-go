import Image from "next/image";

import { cn } from "@/lib/cn";

type AvatarSize = "sm" | "md" | "lg";

const SIZES: Record<AvatarSize, { box: string; text: string; px: number }> = {
  sm: { box: "size-7", text: "text-[11px]", px: 31 },
  md: { box: "size-8", text: "text-xs", px: 35 },
  lg: { box: "size-13", text: "text-base", px: 57 },
};

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

/** "Priya K." → "PK"; "Mei" → "M". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A circular avatar that always renders something.
 *
 * Real photos are the exception here — most users sign in with Google and many
 * have no picture — so the initials tile is the primary case, not a fallback
 * for a broken image. Photos go through `washed` per the design system, which
 * desaturates them so a bright profile picture does not punch out of the warm
 * page.
 */
export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const { box, text, px } = SIZES[size];

  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={px}
        height={px}
        className={cn(box, "washed rounded-full object-cover", className)}
      />
    );
  }

  return (
    <span
      // Decorative: the name is always printed beside the avatar in every
      // place this is used, so repeating it here would double-announce.
      aria-hidden
      className={cn(
        box,
        text,
        "inline-flex items-center justify-center rounded-full",
        "bg-sand-300 font-display text-sand-800",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
