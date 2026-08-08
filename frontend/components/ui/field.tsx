import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The shared control surface: pill, sand fill, hairline border, terracotta
 * caret. Exported so a non-input control (a combobox trigger, a date button)
 * can sit flush in a row of real inputs.
 */
export const controlClasses = [
  "w-full min-h-9 rounded-full px-3.5 py-1.5",
  "bg-sand-100 text-ink text-sm caret-clay",
  "border border-divider",
  "placeholder:text-ink/45",
  "transition-colors duration-150",
  "hover:border-ink/45",
  "focus-visible:border-clay focus-visible:outline-offset-0",
  "disabled:cursor-not-allowed disabled:opacity-45",
].join(" ");

interface FieldProps {
  label: string;
  /** Must match the control's `id`. */
  htmlFor?: string;
  hint?: ReactNode;
  /** When set, the field renders in its error state and `hint` is suppressed. */
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Label + control + one message slot.
 *
 * `hint` and `error` share a slot on purpose: showing a validation error and a
 * helper sentence at once makes the reader work out which one applies. The
 * error wins, and it is wired with `role="alert"` so a screen reader announces
 * it when it appears rather than only when the field is next focused.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-clay-700">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink/55">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        controlClasses,
        // A pill radius on a multi-line box clips the first and last lines, so
        // the textarea is the one control that stays at the card radius.
        "min-h-20 resize-y rounded-card px-4 py-2",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          controlClasses,
          // Room for the chevron, and the native arrow removed so the control
          // matches the rest of the system across browsers.
          "appearance-none pr-9",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs text-ink/55"
      >
        ▾
      </span>
    </div>
  );
}
