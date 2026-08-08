import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

const BASE = [
  "inline-flex items-center gap-1 whitespace-nowrap",
  "rounded-full px-3 py-1 text-xs font-medium",
  "cursor-pointer select-none no-underline",
  "transition-colors duration-150",
].join(" ");

const UNSELECTED = "border border-divider text-ink hover:bg-ink/7";
const SELECTED = "border border-clay bg-clay text-ground hover:bg-clay-600";

export function chipClasses(selected: boolean): string {
  return cn(BASE, selected ? SELECTED : UNSELECTED);
}

/**
 * A pill that toggles something. Three shapes, deliberately kept apart rather
 * than merged behind one polymorphic component:
 *
 *   `Chip`        — a button. Client-side state (a filter sheet, a wizard step).
 *   `ChipLink`    — a link. State that belongs in the URL (sort order, tab).
 *   `ChoiceGroup` — radio inputs. One-of-many inside a form.
 *
 * Picking the wrong one is an accessibility bug, not a style preference: a
 * radio group gets arrow-key navigation and a group label for free, a button
 * does not, and a link is the only one that survives being bookmarked.
 */
export function Chip({
  selected = false,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(chipClasses(selected), className)}
      {...props}
    />
  );
}

export function ChipLink({
  selected = false,
  className,
  ...props
}: ComponentProps<typeof Link> & { selected?: boolean }) {
  return (
    <Link
      // Not aria-pressed: this is navigation, and the selected chip describes
      // where you are rather than a control you have switched on.
      aria-current={selected ? "page" : undefined}
      className={cn(chipClasses(selected), className)}
      {...props}
    />
  );
}

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface ChoiceGroupProps<T extends string> {
  /** Shared radio `name`. Also the form field key on submit. */
  name: string;
  legend: string;
  options: readonly ChoiceOption<T>[];
  /** Provide for a controlled group; pair with `onChange`. */
  value?: T;
  /** Provide for an uncontrolled group. */
  defaultValue?: T;
  onChange?: (value: T) => void;
  /** Hide the legend visually but keep it for screen readers. */
  hideLegend?: boolean;
  className?: string;
}

/**
 * One-of-many chips backed by real radio inputs.
 *
 * The input is visually hidden rather than `display: none` so it stays
 * focusable; the pill styling hangs off `peer-checked` and `peer-focus-visible`
 * on the sibling span. This is the same approach the design system's `.seg`
 * component takes, and it means the control needs no JavaScript to be usable —
 * `onChange` is optional, and omitting it leaves a plain form field.
 */
interface CheckChipGroupProps<T extends string> {
  name: string;
  legend: string;
  options: readonly ChoiceOption<T>[];
  /** Currently ticked values. Uncontrolled: this seeds `defaultChecked`. */
  defaultValue?: readonly T[];
  hideLegend?: boolean;
  className?: string;
}

/**
 * Many-of-many chips backed by checkboxes.
 *
 * Same mechanism as `ChoiceGroup` with `type="checkbox"`, which matters for the
 * fuel filter: three ticked boxes sharing a `name` submit as three repeats of
 * that key, which is exactly what `?fuel=petrol&fuel=hybrid` needs. Radios
 * cannot express it and a comma-joined single value would need custom parsing
 * on both ends.
 *
 * Uncontrolled by design — it lives inside a GET form whose submit button is
 * the commit point, so there is no interim state worth holding in React.
 */
export function CheckChipGroup<T extends string>({
  name,
  legend,
  options,
  defaultValue = [],
  hideLegend = true,
  className,
}: CheckChipGroupProps<T>) {
  return (
    <fieldset className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <legend className={hideLegend ? "sr-only" : "label mb-1"}>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="inline-flex">
          <input
            type="checkbox"
            name={name}
            value={option.value}
            disabled={option.disabled}
            defaultChecked={defaultValue.includes(option.value)}
            className="peer sr-only"
          />
          <span
            className={cn(
              BASE,
              UNSELECTED,
              "peer-checked:border-clay peer-checked:bg-clay peer-checked:text-ground",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-clay",
              "peer-disabled:cursor-not-allowed peer-disabled:opacity-45",
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function ChoiceGroup<T extends string>({
  name,
  legend,
  options,
  value,
  defaultValue,
  onChange,
  hideLegend = true,
  className,
}: ChoiceGroupProps<T>) {
  const controlled = value !== undefined;

  return (
    <fieldset className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <legend className={hideLegend ? "sr-only" : "label mb-1"}>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="inline-flex">
          <input
            type="radio"
            name={name}
            value={option.value}
            disabled={option.disabled}
            className="peer sr-only"
            {...(controlled
              ? { checked: value === option.value }
              : { defaultChecked: defaultValue === option.value })}
            onChange={onChange ? () => onChange(option.value) : undefined}
          />
          <span
            className={cn(
              BASE,
              UNSELECTED,
              "peer-checked:border-clay peer-checked:bg-clay peer-checked:text-ground",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-clay",
              "peer-disabled:cursor-not-allowed peer-disabled:opacity-45",
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
