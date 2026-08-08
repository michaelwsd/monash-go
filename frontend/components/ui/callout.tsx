import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export type CalloutTone = "muted" | "note" | "warning" | "positive";

const TONES: Record<CalloutTone, string> = {
  /** Assumptions, zero states, "nothing here yet" — recedes. */
  muted: "border border-dashed border-divider bg-sand-100/60 text-ink/75",
  /** A designer's aside about behaviour. Terracotta text, no fill. */
  note: "text-clay-700",
  /** Rejection and validation. Tinted so it cannot be skimmed past. */
  warning: "bg-clay-100 text-clay-800",
  /** The green story: what this booking avoids, what it will earn. */
  positive: "bg-sage-100 text-sage-800",
};

interface CalloutProps extends ComponentProps<"div"> {
  tone?: CalloutTone;
}

/**
 * A block of secondary prose.
 *
 * The wireframes lean on these heavily — every screen has at least one line
 * explaining an assumption, a privacy rule, or an empty state. Giving them one
 * component keeps that voice consistent instead of re-deciding the treatment
 * per page.
 *
 * `warning` is a tint rather than a red: the palette has no red, and the design
 * system forbids desaturating out of the warm range. Terracotta on its own 100
 * tint is the system's own way of saying "attention".
 */
export function Callout({ tone = "muted", className, ...props }: CalloutProps) {
  return (
    <div
      className={cn(
        "rounded-card px-3 py-2.5 text-xs leading-relaxed",
        // `note` is bare text, so it should not carry the box padding.
        tone === "note" && "px-0 py-0 font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
