import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Join class names, letting later Tailwind utilities win over earlier ones in
 * the same group.
 *
 * Without `twMerge`, `cn("px-3", "px-6")` emits both and the winner depends on
 * CSS source order — which for utility classes is effectively arbitrary. Every
 * component here accepts a `className` prop for local adjustment, so a
 * predictable override rule is a hard requirement, not a nicety.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
