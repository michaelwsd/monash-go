"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { syncUser } from "@/lib/api";
import { CurrentUserContext } from "@/lib/use-current-user";
import { useQuery } from "@/lib/use-query";

/**
 * The first-sign-in gate, and the one place the current user is fetched.
 *
 * POST /users/sync runs on every load: it creates the users row and its rewards
 * row the first time and returns the existing one afterwards, so it doubles as
 * "who am I in our database". If that row has no home_campus, the profile has
 * never been filled in and the user goes to /onboarding.
 *
 * home_campus is the completion flag rather than "the row didn't exist a moment
 * ago", because sync itself creates the row. Anyone who abandons onboarding
 * halfway is already in the database, and only a field they have to supply can
 * tell that apart from a finished profile.
 *
 * The children are held back until the check resolves. Painting a dashboard and
 * then yanking it away reads as a bug; a brief spinner does not.
 *
 * The row is then shared through CurrentUserContext, so the header badge, the
 * search form's default campus and the ride page's "is this my ride" check all
 * read the one fetch instead of each making their own.
 *
 * Lives in the (app) layout. It must not go in the root layout, which also
 * covers /sign-in and /onboarding itself - gating /onboarding on having
 * finished onboarding would never terminate.
 */
export function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const query = useQuery((token) => syncUser({ token }), []);

  const needsOnboarding = query.status === "ready" && query.data?.home_campus === null;

  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  // A backend that is down must not lock anyone out of a page that does not
  // need it yet. Let them through with no user; the pages that need data will
  // report their own failure.
  if (query.status === "loading" || needsOnboarding) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/40">
        <Loader2
          className="size-5 animate-spin text-muted-foreground"
          aria-label="Loading your profile"
        />
      </div>
    );
  }

  return <CurrentUserContext.Provider value={query}>{children}</CurrentUserContext.Provider>;
}
