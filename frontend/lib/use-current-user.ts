"use client";

import { createContext, useContext } from "react";

import type { User } from "@/lib/api";
import type { QueryState } from "@/lib/use-query";

/**
 * The signed-in user's row from our database, not Clerk's.
 *
 * They are different objects and both are needed: Clerk owns the name, email
 * and avatar; our row owns the phone, campus, concession flag and green
 * points. Anything the backend stores comes from here.
 *
 * Fetched once, by RequireOnboarding in the (app) layout, and shared through
 * context. Before that existed, the shell and every page each called
 * POST /users/sync for the same row - three round trips per page load.
 */
export type CurrentUser = QueryState<User>;

export const CurrentUserContext = createContext<CurrentUser | null>(null);

export function useCurrentUser(): CurrentUser & {
  user: User | null;
  setUser: (user: User) => void;
} {
  const value = useContext(CurrentUserContext);
  if (value === null) {
    throw new Error("useCurrentUser must be used inside RequireOnboarding");
  }
  return { ...value, user: value.data, setUser: value.setData };
}
