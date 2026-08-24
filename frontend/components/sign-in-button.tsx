"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useSignIn } from "@clerk/nextjs";

/**
 * A pill that sits collapsed to a single arrow and grows to the full width of
 * the card on hover, revealing its label.
 *
 * On touch devices there is no hover, so an arrow-only button would never
 * explain itself. Everything here is therefore expanded by default and only
 * collapses inside `@media (hover: hover)` - pointer devices get the animation,
 * touch devices get an ordinary labelled button.
 *
 * It also expands on `focus-visible`, so the label is reachable by keyboard.
 */
export function SignInButton() {
  // Clerk 7 replaced the old `{ isLoaded, signIn }` shape with this one.
  // `signIn.sso()` RETURNS an error rather than throwing, so the result has to
  // be inspected - a bare try/catch would silently swallow every failure.
  const { signIn } = useSignIn();
  const [pending, setPending] = useState(false);

  async function startGoogleSignIn() {
    if (!signIn || pending) return;
    setPending(true);

    const { error } = await signIn.sso({
      strategy: "oauth_google",
      redirectUrl: "/", // where we land once a session exists
      redirectCallbackUrl: "/sign-in/sso-callback", // where Google returns to
    });

    // On success the browser has already left for Google, so this only runs
    // when the redirect could not be started at all.
    if (error) setPending(false);
  }

  return (
    <button
      type="button"
      onClick={startGoogleSignIn}
      disabled={pending}
      className="group relative mx-auto flex h-[46px] w-full items-center overflow-hidden rounded-full bg-primary text-primary-foreground outline-none transition-[width,box-shadow] duration-500 ease-out focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70 [@media(hover:hover)]:w-[46px] [@media(hover:hover)]:focus-visible:w-full [@media(hover:hover)]:hover:w-full"
    >
      {/* Two labels, one visible at a time. The full sentence does not fit
          beside the arrow on a 320px screen, where the button is permanently
          expanded. `hidden` is display:none, so screen readers only ever
          announce the one that is showing. */}
      <span className="absolute inset-0 flex items-center justify-center pr-9 pl-5 text-[13px] font-medium whitespace-nowrap transition-opacity duration-200 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-visible:opacity-100 [@media(hover:hover)]:group-focus-visible:delay-200 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:delay-200">
        {pending ? (
          "Taking you to Google"
        ) : (
          <>
            <span className="hidden sm:inline">
              Sign in with your Monash account
            </span>
            <span className="sm:hidden">Sign in with Monash</span>
          </>
        )}
      </span>
      {pending ? (
        <Loader2
          className="absolute right-[14px] size-[18px] animate-spin"
          strokeWidth={2.25}
          aria-hidden
        />
      ) : (
        <ArrowRight
          className="absolute right-[14px] size-[18px] transition-transform duration-500 ease-out group-hover:translate-x-0.5"
          strokeWidth={2.25}
          aria-hidden
        />
      )}
    </button>
  );
}
