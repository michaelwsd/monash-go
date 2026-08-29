"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

import { syncUser } from "@/lib/api";

/**
 * The first-sign-in gate.
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
 * Wrap protected pages with this. Today "/" is the only one, so it lives there.
 * Once there are several, move it into a shared layout for those routes - it
 * must not go in the root layout, which also covers /sign-in and /onboarding
 * itself, and gating /onboarding on onboarding would never terminate.
 */
export function RequireOnboarding({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  // Clerk does not promise a stable getToken identity; a ref keeps this effect
  // from re-running on every render. Same reasoning as lib/use-vehicle-search.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  useEffect(() => {
    // proxy.ts has already bounced signed-out visitors, so this is the brief
    // moment before Clerk has hydrated rather than a real anonymous visit.
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;

    (async () => {
      try {
        const user = await syncUser({ token: await getTokenRef.current() });
        if (cancelled) return;

        if (user.home_campus === null) {
          router.replace("/onboarding");
          return; // stay on the spinner; the route is already changing
        }
      } catch {
        // A backend that is down must not lock anyone out of a page that does
        // not need it yet. Let them through; the pages that do need data will
        // report their own failure.
      }
      if (!cancelled) setChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, router]);

  if (!checked) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/40">
        <Loader2
          className="size-5 animate-spin text-muted-foreground"
          aria-label="Loading your profile"
        />
      </div>
    );
  }

  return <>{children}</>;
}
