import { XCircle } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { SignInButton } from "@/components/sign-in-button";
import { SignInIllustration } from "@/components/sign-in-illustration";

/**
 * Sign-in screen. Follows artboard 1e of "MonashGo Wireframes v2":
 * a single Monash Google button with the domain rule stated up front.
 *
 * The [[...sign-in]] folder name is a catch-all, so /sign-in and any path
 * beneath it (Clerk appends its own, e.g. /sign-in/factor-one) render here.
 */
export default async function SignInPage({
  searchParams,
}: {
  // Next 16 hands searchParams over as a promise, so this page is async.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Set by components/monash-guard.tsx when it signs a non-Monash account out.
  const rejected = (await searchParams).error === "not-monash";

  // Clerk rejects signIn.sso() with a 400 (session_exists) if a session is
  // already active, so an already-signed-in visitor must never see the button.
  // Skipped while `rejected` is set: MonashGuard is mid-sign-out at that point
  // and bouncing them to "/" would hide the message they need to read.
  const { userId } = await auth();
  if (userId && !rejected) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      {/* Pressing back from Google leaves Clerk permanently stuck at
          status "loading": its script loads but never requests /v1/environment
          or /v1/client. React therefore never hydrates, and the sign-in button
          below is inert HTML that swallows every click with no error.

          This has to run before React, because the thing that is broken is
          hydration itself - an effect inside a component would never fire.
          Reloading turns the visit into an ordinary load, which initialises
          Clerk normally, and sets the navigation type to "reload" so it cannot
          loop. Scoped to this page rather than the layout so back navigation
          stays instant everywhere else. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `if(performance.getEntriesByType('navigation')[0]?.type==='back_forward'){location.reload()}`,
        }}
      />
      <Card className="w-full max-w-[400px] gap-0 px-5 py-[26px] sm:px-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.025em]">
          MonashGo
        </h1>

        <p className="mt-1.5 max-w-[280px] text-[13px]/[1.5] text-muted-foreground">
          Share the drive between campuses. See what it costs the planet before
          you go.
        </p>

        {/* Aspect ratio rather than a fixed height, so the illustration keeps
            its proportions as the card narrows on a phone. 352x110 is the
            slot size on artboard 1e, reached at the card's full width. */}
        <div className="my-5 aspect-[352/110] w-full overflow-hidden rounded-md border bg-card">
          <SignInIllustration />
        </div>

        <SignInButton />

        <p className="mt-2.5 text-center text-[11.5px] text-muted-foreground">
          Only @student.monash.edu and @monash.edu accounts
        </p>

        {rejected && (
          <Alert
            variant="destructive"
            className="mt-4 items-start gap-x-2 border-destructive-border bg-destructive-muted p-2.5"
          >
            <XCircle className="size-3.5" aria-hidden />
            <AlertTitle className="text-[11.5px]/[1.45] font-medium text-wrap">
              That account isn&apos;t a Monash address. Try again with your
              student email.
            </AlertTitle>
          </Alert>
        )}
      </Card>
    </main>
  );
}
