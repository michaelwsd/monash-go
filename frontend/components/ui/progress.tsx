import { cn } from "@/lib/cn";

interface ProgressBarProps {
  value: number;
  max: number;
  /** Announced to screen readers, e.g. "Progress to stage 3". */
  label: string;
  className?: string;
}

/**
 * A sage progress track.
 *
 * Sage is the site's green/CO2 colour and every progress bar here measures an
 * environmental total, so the tone is fixed rather than a prop — a terracotta
 * progress bar would imply a different kind of quantity.
 *
 * Rendered as a real `role="progressbar"` with its aria values, so the pet
 * page's "2.6 kg to stage 3" is available to a screen reader without relying on
 * the caption underneath it.
 */
export function ProgressBar({ value, max, label, className }: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-sand-300", className)}
    >
      <div
        className="h-full rounded-full bg-sage transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
