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
export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-[400px] gap-0 px-5 py-[26px] sm:px-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.025em]">MonashGo</h1>

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

      </Card>
    </main>
  );
}
