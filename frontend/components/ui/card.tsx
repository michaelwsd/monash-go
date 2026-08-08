import type { ComponentProps, ElementType } from "react";

import { cn } from "@/lib/cn";

export type Elevation = "none" | "sm" | "md" | "lg";

const ELEVATIONS: Record<Elevation, string> = {
  none: "",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
};

interface CardProps extends ComponentProps<"div"> {
  elevation?: Elevation;
  /** Drop the built-in padding when the card owns its own internal grid. */
  bare?: boolean;
  /** Render as <li>, <article>, <section>… when the surrounding markup needs it. */
  as?: ElementType;
}

/**
 * The system's content surface: a sand fill on the cream ground, no border,
 * over-rounded (28px x 1.15).
 *
 * The wireframes drew every container as a 2px ink outline — that is sketch
 * notation, not a specification. Organic separates surfaces by fill and
 * elevation and explicitly forbids "sharp corners or hairline-only geometry",
 * so the outline becomes a fill here.
 */
export function Card({
  elevation = "none",
  bare = false,
  as: Component = "div",
  className,
  ...props
}: CardProps) {
  return (
    <Component
      className={cn(
        // `flex flex-col gap-2` is part of the design system's own `.card`, not
        // a convenience: every consumer sets `gap-*` to space its children, and
        // several switch to `sm:flex-row` at width. Without a flex container
        // here, both are silently ignored and the card falls back to block
        // layout — which is exactly the bug the first render of this kit shipped.
        "flex flex-col gap-2 rounded-card bg-surface",
        !bare && "p-3",
        ELEVATIONS[elevation],
        className,
      )}
      {...props}
    />
  );
}

/**
 * A dashed, unfilled container. The wireframes' `.ghost` treatment, kept for
 * the cases it genuinely marks: an empty slot, a not-yet-real asset (map, pet
 * art), or an aside that must read as secondary to the cards around it.
 */
export function GhostPanel({
  className,
  as: Component = "div",
  ...props
}: ComponentProps<"div"> & { as?: ElementType }) {
  return (
    <Component
      className={cn(
        "rounded-card border border-dashed border-divider bg-sand-100/60 p-3",
        className,
      )}
      {...props}
    />
  );
}

/** Small uppercase eyebrow above a card's content. Terracotta, per the system. */
export function CardKicker({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-[10px] font-semibold uppercase tracking-widest text-clay-700",
        className,
      )}
      {...props}
    />
  );
}

/** The display-face title inside a card. Defaults to an <h3>. */
export function CardTitle({
  className,
  as: Component = "h3",
  ...props
}: ComponentProps<"h3"> & { as?: ElementType }) {
  return (
    <Component
      className={cn("font-display text-[17px] leading-tight", className)}
      {...props}
    />
  );
}
