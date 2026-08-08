import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type StatTone = "ink" | "sage" | "clay";

const TONES: Record<StatTone, string> = {
  ink: "text-ink",
  /** Anything that went down: CO2 avoided, money saved, a greener option. */
  sage: "text-sage-700",
  /** Anything that went up, or the option the user should not pick. */
  clay: "text-clay-700",
};

export type StatSize = "sm" | "md" | "lg";

const SIZES: Record<StatSize, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-[28px]",
};

interface StatProps {
  value: ReactNode;
  label: ReactNode;
  tone?: StatTone;
  size?: StatSize;
  /** Extra lines under the label, e.g. "$2.85 conc." and "48 min". */
  detail?: ReactNode;
  className?: string;
}

/**
 * A headline number over a small label.
 *
 * The 700 ramp step, not the base accent, carries the tone. The design system
 * only guarantees 3:1 for its base accents — enough for chrome, not for a
 * number a user is meant to compare — so anything readable steps down the ramp.
 */
export function Stat({
  value,
  label,
  tone = "ink",
  size = "md",
  detail,
  className,
}: StatProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className={cn("font-display leading-none", SIZES[size], TONES[tone])}>
        {value}
      </span>
      <span className="label">{label}</span>
      {detail ? <div className="mt-1 text-xs leading-relaxed">{detail}</div> : null}
    </div>
  );
}
