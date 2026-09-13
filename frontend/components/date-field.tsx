"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { FIELD, FieldLabel } from "@/components/form-fields";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { todayMelbourne } from "@/lib/time";
import { cn } from "@/lib/utils";

/* A native <input type="date"> opens a picker drawn by the OS: Chrome's blue,
   Safari's wheels, no token colours anywhere. Same reason form-fields.tsx uses
   a Radix listbox over <select>. This is a month grid in our own DOM.

   Values are plain YYYY-MM-DD strings, which is what the search and post
   forms hold and what the API takes. No Date objects cross this boundary, so
   the browser's timezone never gets a say in which day was picked. */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function monthTitle(y: number, m: number): string {
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m, 1)),
  );
}

/** `Sun 13 Sep 2026`, for the trigger. Assembled from parts: the en-AU and
    en-GB locales spell September "Sept" and add a comma, and the extra width
    was enough to wrap the field onto two lines. */
function display(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  const p: Record<string, string> = {};
  for (const { type, value: v } of new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(Date.UTC(y, m - 1, d)))) {
    p[type] = v;
  }
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}

/** Six rows of seven, Monday first, padded with the neighbouring months. */
function gridFor(y: number, m: number): { key: string; day: number; inMonth: boolean }[] {
  const first = new Date(Date.UTC(y, m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Sunday=0 -> Monday-first offset
  const start = new Date(Date.UTC(y, m, 1 - lead));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000);
    return {
      key: iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === m,
    };
  });
}

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest pickable day, YYYY-MM-DD. */
  min?: string;
}

export function DateField({ label, value, onChange, min }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const today = todayMelbourne();
  const anchor = value || today;
  const [view, setView] = useState(() => {
    const [y, m] = anchor.split("-").map(Number);
    return { y, m: m - 1 };
  });

  const shift = (by: number) => {
    const d = new Date(Date.UTC(view.y, view.m + by, 1));
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };

  const pick = (day: string) => {
    onChange(day);
    setOpen(false);
  };

  return (
    <FieldLabel label={label}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            FIELD,
            "flex items-center justify-between gap-2 text-left whitespace-nowrap tabular-nums",
            !value && "text-muted-foreground",
          )}
        >
          {value ? display(value) : "Pick a day"}
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </PopoverTrigger>

        <PopoverContent className="w-[18rem]">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">{monthTitle(view.y, view.m)}</p>
            <div className="flex gap-1">
              <NavButton label="Previous month" onClick={() => shift(-1)}>
                <ChevronLeft className="size-4" aria-hidden />
              </NavButton>
              <NavButton label="Next month" onClick={() => shift(1)}>
                <ChevronRight className="size-4" aria-hidden />
              </NavButton>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="pb-1 text-[10px] font-medium text-muted-foreground">
                {w}
              </span>
            ))}
            {gridFor(view.y, view.m).map(({ key, day, inMonth }) => {
              const disabled = min !== undefined && key < min;
              const selected = key === value;
              const isToday = key === today;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={display(key)}
                  onClick={() => pick(key)}
                  className={cn(
                    "relative mx-auto flex size-9 items-center justify-center rounded-md text-sm tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-eco",
                    selected
                      ? "bg-foreground font-medium text-background"
                      : "hover:bg-muted",
                    !inMonth && !selected && "text-muted-foreground/50",
                    disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
                  )}
                >
                  {day}
                  {/* A dot marks today; the fill marks the pick. Both can be true. */}
                  {isToday && !selected && (
                    <span
                      className="absolute bottom-1 size-1 rounded-full bg-eco"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-end border-t pt-2">
            <button
              type="button"
              onClick={() => {
                const [y, m] = today.split("-").map(Number);
                setView({ y, m: m - 1 });
                pick(today);
              }}
              className="rounded px-2 py-1 text-xs font-medium text-eco-foreground hover:bg-eco-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-eco"
            >
              Today
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </FieldLabel>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-eco"
    >
      {children}
    </button>
  );
}
