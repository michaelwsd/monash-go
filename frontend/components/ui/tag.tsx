import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export type TagTone = "clay" | "sage" | "neutral" | "outline";

/**
 * Tints are always the 100 step of a ramp behind the 800 step as text. Both
 * steps come from the same shared perceptual lightness scale, so every tone
 * lands on the same contrast ratio without being checked individually.
 */
const TONES: Record<TagTone, string> = {
  clay: "bg-clay-100 text-clay-800",
  sage: "bg-sage-100 text-sage-800",
  neutral: "bg-sand-100 text-sand-800",
  outline: "border border-clay text-clay-700",
};

interface TagProps extends ComponentProps<"span"> {
  tone?: TagTone;
}

/** A small, non-interactive label. For anything clickable use `Chip`. */
export function Tag({ tone = "neutral", className, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] tracking-[0.02em] whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
