"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { syncUser, type User } from "@/lib/api";

export interface CurrentUserState {
  user: User | null;
  status: "loading" | "ready" | "error";
  /** Replaces the cached user after a write, with no second round trip. */
  setUser: (user: User) => void;
  /** Refetches from the API. For a retry button on the error state. */
  reload: () => void;
}

/**
 * The signed-in user's row from our database, not Clerk's.
 *
 * They are different objects and both are needed: Clerk owns the name, email
 * and avatar; our row owns the phone, campus, concession flag and green
 * points. Anything the backend stores comes from here.
 *
 * POST /users/sync is the read. It looks like a write, and it is on a first
 * sign-in, but afterwards it returns the existing row untouched - which is why
 * the frontend is expected to call it on every page load. There is no
 * GET /users/me.
 *
 * A Clerk session token expires in about a minute, so it is fetched per
 * request rather than held in state.
 */
export function useCurrentUser(): CurrentUserState {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<CurrentUserState["status"]>("loading");
  const [attempt, setAttempt] = useState(0);

  // setStatus belongs here rather than at the top of the effect: React 19
  // flags a synchronous setState in an effect body, and an event handler is
  // the correct place for it anyway.
  const reload = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;

    (async () => {
      try {
        const row = await syncUser({ token: await getToken() });
        if (cancelled) return;
        setUser(row);
        setStatus("ready");
      } catch {
        // The page decides what to show; the hook only reports that it failed.
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // getToken is deliberately absent: Clerk does not promise a stable
    // identity for it, and including it would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, attempt]);

  return { user, status, setUser, reload };
}
