import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Runs before every request that matches `config.matcher` below.
 *
 * Next.js 16 renamed this file from `middleware.ts` to `proxy.ts`; the
 * behaviour is unchanged. Clerk's own docs still say `middleware.ts`, so
 * `clerkMiddleware` keeps its name even though it now lives in `proxy.ts`.
 * See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
 */

// Pages a signed-out visitor is allowed to see. Everything else needs a session.
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    // Sends signed-out users to NEXT_PUBLIC_CLERK_SIGN_IN_URL (/sign-in),
    // with a return URL so they land back where they were headed.
    await auth.protect(); // checks if the user is authenticated
  }
});

export const config = {
  matcher: [
    // Everything except Next internals and static files, unless they carry a
    // query string (a signed-in page can still request a static asset).
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run on API and tRPC routes.
    "/(api|trpc)(.*)",
  ],
};
