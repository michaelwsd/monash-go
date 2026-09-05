import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* One source of truth for field chrome, so an input and a select can never
   drift apart on border, radius, padding or focus ring. Shared by the
   onboarding form, the vehicle picker and the pages under (app).

   Semantic tokens rather than literal greys: these are the same colours in the
   light theme, and they are the only reason the fields stay legible if the
   .dark class in globals.css is ever switched on. A literal bg-white keeps a
   white input on a near-black card. --eco is emerald-600, so the focus ring is
   unchanged. */
export const FIELD =
  "w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-eco";

export function FieldLabel({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  /** A unit shown inside the field's right edge, e.g. "L/100km". */
  suffix?: string;
}

/* `cn` rather than a template string so a caller's className can override a
   base utility (a read-only field's bg-gray-100 beating bg-white) instead of
   both landing in the class list and the cascade deciding.

   A unit belongs in the field, not the label. Put it in the label and the text
   wraps at narrow widths, which makes the label two lines tall and pushes the
   input below its neighbour in the same grid row. */
export function TextField({
  label,
  hint,
  suffix,
  className,
  ...props
}: TextFieldProps) {
  const input = (
    <input
      {...props}
      className={cn(
        FIELD,
        "placeholder:text-muted-foreground",
        suffix && "pr-20",
        className,
      )}
    />
  );

  return (
    <FieldLabel label={label} hint={hint}>
      {suffix ? (
        <span className="relative block">
          {input}
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            {suffix}
          </span>
        </span>
      ) : (
        input
      )}
    </FieldLabel>
  );
}

export interface SelectOption {
  /** what the API wants, e.g. "petrol" */
  value: string;
  /** what the user reads, e.g. "Petrol" */
  label: string;
}

interface SelectFieldProps {
  label: string;
  placeholder: string;
  options: readonly SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

/* A native <select>'s option list is drawn by the OS, so CSS cannot reach it:
   no radius, no padding, no token colours, and `color-scheme` in globals.css is
   the only lever over even its light/dark appearance. This is the Radix listbox
   instead - real DOM we own, so the panel matches the card in any theme, and
   keyboard navigation and typeahead come from the primitive.

   Radix has no concept of an empty option, so the placeholder lives on
   SelectValue. "" is passed through rather than collapsed to undefined: Radix
   already reads it as "nothing chosen", and undefined would make the component
   uncontrolled until the first pick.

   Options carry a separate value and label because the backend's enums are
   lowercase ("petrol") and the UI is not. Storing the wire value and rendering
   the label means nothing has to be translated at the point of the request. */
export function SelectField({
  label,
  placeholder,
  options,
  value,
  onValueChange,
  disabled,
}: SelectFieldProps) {
  return (
    <FieldLabel label={label}>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        {/* The trigger ships at h-8 with token colours; these overrides sit it
            on the same chrome as TextField. `data-[size=default]:h-auto` rather
            than `h-auto` because the default height is set through a data
            attribute, which outranks a bare utility. */}
        <SelectTrigger
          className={`${FIELD} w-full justify-between data-[size=default]:h-auto data-placeholder:text-muted-foreground focus-visible:border-eco focus-visible:ring-2 focus-visible:ring-eco disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        {/* `popper` drops the panel below the field. The default,
            `item-aligned`, covers the trigger the way a native select does,
            which is what made the old menu look like it was floating loose. */}
        <SelectContent
          position="popper"
          align="start"
          sideOffset={6}
          className="w-(--radix-select-trigger-width)"
        >
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldLabel>
  );
}
