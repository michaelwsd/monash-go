"use client";

import { useEffect, useRef } from "react";
import { useClerk, useUser } from "@clerk/nextjs";

import { isMonashEmail } from "@/lib/monash";

/**
 * Signs out anyone who reaches the app with a non-Monash Google account and
 * sends them back to /sign-in with the rejection message.
 *
 * Why this exists: Clerk's own domain allowlist is a paid feature, so the
 * sign-in itself cannot be blocked at the door. This is the next best thing -
 * the account is admitted by Clerk, then immediately shown out.
 *
 * This is UX, not security. A signed-out user simply cannot reach anything
 * useful, because backend/app/services/user_service.py refuses to create a
 * user row for a non-Monash address regardless of what the browser does.
 *
 * Renders nothing. Mounted once in the root layout so it covers every page.
 */
export function MonashGuard() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  // signOut is async and the effect can re-run before it resolves; without
  // this latch a slow network would fire several sign-outs.
  const signingOut = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || signingOut.current) return;

    const email = user.primaryEmailAddress?.emailAddress;
    // No email yet means Clerk has not finished hydrating the user. Doing
    // nothing is correct here: acting would sign out a legitimate account
    // mid-load, and there is nothing they can reach in the meantime anyway.
    if (!email || isMonashEmail(email)) return;

    signingOut.current = true;
    void signOut({ redirectUrl: "/sign-in?error=not-monash" });
  }, [isLoaded, isSignedIn, user, signOut]);

  return null;
}
