import { RequireOnboarding } from "@/components/require-onboarding";

/**
 * The signed-in application shell.
 *
 * `(app)` is a route group: the parentheses keep it out of the URL, so the page
 * inside is still "/". It exists to give the pages that need a complete profile
 * a layout of their own. /sign-in and /onboarding sit outside it deliberately -
 * gating onboarding on having finished onboarding would never terminate.
 *
 * Every protected page added from here on goes in this folder and inherits the
 * check for free.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireOnboarding>{children}</RequireOnboarding>;
}
