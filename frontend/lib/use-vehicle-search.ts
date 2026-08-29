"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import {
  ApiError,
  searchVehicleReference,
  type VehicleReference,
} from "@/lib/api";

/** Long enough that a typist doesn't fire a request per keystroke, short
    enough that the list feels like it's keeping up. */
const DEBOUNCE_MS = 300;

/** "t" matches most of the dataset and tells the user nothing. */
const MIN_MAKE_LENGTH = 2;

export interface VehicleSearchState {
  results: VehicleReference[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

const IDLE: VehicleSearchState = { results: [], status: "idle", error: null };

/**
 * Typeahead against GET /vehicles/reference.
 *
 * Two separate problems get solved here, and they are easy to confuse:
 *
 *   - The debounce stops one request per keystroke.
 *   - The AbortController stops the *stale response* bug. Type "toy" then
 *     "toyota"; if the slower "toy" request resolves second, its rows would
 *     overwrite the newer ones and the list would contradict the input. The
 *     effect's cleanup aborts the previous request before starting the next.
 *
 * A Clerk session token expires in about a minute, so it is fetched per
 * request rather than held in state.
 */
export function useVehicleSearch(
  make: string,
  model: string,
  year?: number,
): VehicleSearchState {
  const { getToken } = useAuth();
  const [state, setState] = useState<VehicleSearchState>(IDLE);

  const trimmedMake = make.trim();
  const trimmedModel = model.trim();

  /* Derived, not stored. Writing IDLE into state when the make gets too short
     would be a synchronous setState inside the effect below, which cascades a
     second render for something the arguments already tell us. */
  const enabled = trimmedMake.length >= MIN_MAKE_LENGTH;

  /* Clerk does not promise a stable `getToken` identity across renders, and a
     new identity in the dependency array below would re-run the search on
     every render. The ref keeps the effect keyed to the query alone. */
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setState((previous) => ({ ...previous, status: "loading" }));

      try {
        const results = await searchVehicleReference(
          {
            make: trimmedMake,
            model: trimmedModel || undefined,
            year,
          },
          { token: await getTokenRef.current(), signal: controller.signal },
        );
        setState({ results, status: "ready", error: null });
      } catch (error) {
        // A superseded request is not a failure, and the component may already
        // be gone. Either way there is nothing to report.
        if (controller.signal.aborted) return;

        setState({
          results: [],
          status: "error",
          error:
            error instanceof ApiError && error.status === 401
              ? "Your session expired. Refresh the page and try again."
              : "We couldn't reach the vehicle database. You can still enter your car manually.",
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, trimmedMake, trimmedModel, year]);

  /* Below the minimum length there is nothing to show, whatever the last
     completed search left behind. */
  return enabled ? state : IDLE;
}
