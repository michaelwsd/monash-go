import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

/**
 * Where Google returns to after the user picks an account.
 *
 * `AuthenticateWithRedirectCallback` reads the one-time code in the URL,
 * exchanges it with Clerk for a session, and then navigates on. It renders
 * nothing, so the spinner below is what the user actually sees for the
 * fraction of a second this page exists.
 *
 * This lives under /sign-in on purpose: proxy.ts already treats "/sign-in(.*)"
 * as public, and a signed-out visitor is exactly who arrives here. A static
 * segment also outranks the sibling [[...sign-in]] catch-all, so this file
 * wins for this one path.
 */
export default function SsoCallbackPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <div className="flex flex-col items-center gap-3">
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-hidden
        />
        <p className="text-[13px] text-muted-foreground">Signing you in...</p>
      </div>
      <AuthenticateWithRedirectCallback signInUrl="/sign-in" />
    </main>
  );
}
