import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "sage";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  // Solid terracotta. The design system's one primary action.
  primary:
    "bg-clay text-ground hover:bg-clay-600 active:bg-clay-700 disabled:hover:bg-clay",
  // Outlined. Hover and press are ink tints, not accent tints, so a secondary
  // never competes with the primary beside it.
  secondary:
    "border border-divider text-ink hover:bg-ink/7 active:bg-ink/14 disabled:hover:bg-transparent",
  ghost:
    "text-clay-700 hover:bg-clay/10 active:bg-clay/18 disabled:hover:bg-transparent",
  // Sage carries one meaning on this site: the green/CO2 story. It is the
  // correct fill for "Book a seat" and wrong for everything else.
  sage: "bg-sage text-ground hover:bg-sage-600 active:bg-sage-700 disabled:hover:bg-sage",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-8 gap-1 px-3 text-xs",
  md: "min-h-9 gap-1.5 px-4 text-sm",
  // 44px minimum — the touch target the wireframes call for on every primary
  // action, and the WCAG 2.2 target-size floor.
  lg: "min-h-10 gap-2 px-6 text-sm",
};

const BASE = [
  "inline-flex items-center justify-center",
  "rounded-full font-display leading-tight",
  "cursor-pointer select-none no-underline",
  "transition-colors duration-150",
  "disabled:cursor-not-allowed disabled:opacity-45",
].join(" ");

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/**
 * Shared class computation.
 *
 * Exported so `<Button>` and `<ButtonLink>` cannot drift, and so a third
 * consumer (a `<label>` acting as a file picker, say) can borrow the look
 * without a wrapper component. This is the lighter alternative to pulling in a
 * slot/`asChild` polymorphism library for two call shapes.
 */
export function buttonClasses({
  variant = "secondary",
  size = "md",
  fullWidth = false,
}: ButtonStyleProps = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full");
}

type ButtonProps = ButtonStyleProps & ComponentProps<"button">;

export function Button({
  variant,
  size,
  fullWidth,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      // Defaulting to "button" prevents the classic bug where a button inside a
      // form silently submits it.
      type={type}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...props}
    />
  );
}

type ButtonLinkProps = ButtonStyleProps & ComponentProps<typeof Link>;

/** A navigation that looks like a button. Still a real link: middle-click,
 *  open-in-new-tab and prefetch all keep working. */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...props}
    />
  );
}
