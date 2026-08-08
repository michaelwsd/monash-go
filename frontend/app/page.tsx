import { XCircle } from "lucide-react";
import type { Metadata } from "next";

import { SignInIllustration } from "@/components/auth/sign-in-illustration";
import { ButtonLink, Callout, Card, Icon } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sign in",
};

/** The domains Clerk is configured to accept. Stated to the user, not just enforced. */
const ALLOWED_DOMAINS = ["@student.monash.edu", "@monash.edu"];

/**
 * Wireframe 1e — sign in.
 *
 * Outside the `(app)` route group, so it has no header and no tab bar: there is
 * nowhere to navigate to yet.
 *
 * The rejection state is driven by `?error=domain` rather than client state.
 * Clerk performs the OAuth round trip and redirects back here, so by the time
 * the user sees the error the page has been freshly loaded — a `useState` flag
 * would have been wiped by that navigation. It also means the state is
 * reachable for testing by opening the URL.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const rejectedDomain = error === "domain";

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <Card elevation="md" className="w-full max-w-md p-6 sm:p-8">
        <h1 className="text-[32px] leading-none">MonashGo</h1>
        <p className="mt-2 max-w-[280px] text-sm leading-relaxed text-ink/70">
          Share the drive between campuses. See what it costs the planet before
          you go.
        </p>

        <div className="my-6">
          <SignInIllustration />
        </div>

        {/*
          A link, not a button with an onClick: the OAuth handoff is a full
          navigation to Clerk, so this needs no JavaScript and keeps the whole
          page a Server Component. Swap the href for Clerk's hosted sign-in URL.
        */}
        <ButtonLink
          href="/home"
          variant="primary"
          size="lg"
          fullWidth
          className="min-h-11"
        >
          Continue with Monash Google
        </ButtonLink>

        <p className="mt-3 text-center text-xs text-ink/60">
          Only {ALLOWED_DOMAINS.join(" and ")} accounts
        </p>

        {rejectedDomain ? (
          <Callout tone="warning" className="mt-4 flex items-start gap-2">
            <Icon as={XCircle} size={15} className="mt-0.5" />
            <span>
              That account isn&rsquo;t a Monash address. Try again with your
              student email.
            </span>
          </Callout>
        ) : null}
      </Card>
    </div>
  );
}
