import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Lucide at the design system's stroke weight.
 *
 * The system specifies stroke-width 2.75 "for a rounder, heavier look
 * throughout" — heavier than Lucide's default 2. Wrapping the icon rather than
 * passing `strokeWidth` at every call site means the rule is stated once and
 * cannot drift; a lone default-weight icon reads as a rendering bug next to the
 * others.
 */
const STROKE_WIDTH = 2.75;

interface IconProps {
  /** The Lucide component, e.g. `import { Leaf } from "lucide-react"`. */
  as: LucideIcon;
  /** Pixel size. Defaults to 16, which sits with 14-15px body text. */
  size?: number;
  className?: string;
}

export function Icon({ as: Glyph, size = 16, className }: IconProps) {
  return (
    <Glyph
      size={size}
      strokeWidth={STROKE_WIDTH}
      className={cn("shrink-0", className)}
      // Icons here are always paired with a text label or an aria-label on the
      // control, so they are decorative to a screen reader.
      aria-hidden
    />
  );
}
