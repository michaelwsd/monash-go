"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { ApiError } from "@/lib/api";

export type QueryStatus = "loading" | "ready" | "error";

export interface QueryState<T> {
  data: T | null;
  status: QueryStatus;
  /** The API's own message for a 4xx; a generic line otherwise. */
  error: string | null;
  reload: () => void;
  /** Replace the cached value after a write, with no second round trip. */
  setData: (data: T) => void;
}

/**
 * Fetch something from the API when a page mounts, and again on demand.
 *
 * The one shape every page needs: get a Clerk token, call the API, cancel if
 * the page unmounts first, and offer a retry. Written once so the four rules
 * that make it correct are not re-derived per page:
 *
 *   - the token is fetched per request, not held - Clerk's expire in a minute
 *   - a response arriving after unmount is dropped, or React warns
 *   - setState never runs synchronously inside the effect (React 19 rejects
 *     that); the async work sits in an IIFE and retry bumps a counter
 *   - `fn` is read through a ref, so callers can pass an inline closure without
 *     retriggering the effect on every render
 *
 * `deps` are the values whose change should refetch, e.g. a search query.
 * Pass `[]` for fetch-once. `enabled: false` skips the fetch entirely, for a
 * page whose query is not yet complete.
 */
export function useQuery<T>(
  fn: (token: string | null) => Promise<T>,
  deps: readonly unknown[],
  { enabled = true }: { enabled?: boolean } = {},
): QueryState<T> {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<QueryStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const reload = useCallback(() => {
    setStatus("loading");
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !enabled) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await fnRef.current(await getToken());
        if (cancelled) return;
        setData(result);
        setStatus("ready");
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof ApiError && caught.status < 500
            ? caught.message
            : "Something went wrong. Please try again.",
        );
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // getToken has no stable identity from Clerk; deps are the caller's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, enabled, attempt, ...deps]);

  return { data, status, error, reload, setData };
}
