import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { TopNav } from "@/components/layout/top-nav";
import { getCurrentUser } from "@/lib/data/queries";

/**
 * The signed-in shell.
 *
 * `(app)` is a route group, so it adds no URL segment — `/home` stays `/home`.
 * Its purpose is to draw a line between the screens that have a header and a
 * tab bar and the sign-in page at `/`, which has neither.
 *
 * The user is fetched once here rather than in each page. A layout does not
 * re-render on navigation between its children, so the header's name, avatar
 * and points survive a client-side transition without a second request.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <>
      <TopNav
        userName={user.fullName}
        avatarUrl={null}
        greenPoints={user.greenPoints}
      />

      <main
        // `pb-20` on mobile clears the fixed tab bar; from `sm` up the bar is
        // gone and the padding returns to normal.
        className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-6 pb-20 sm:pb-10"
      >
        {children}
      </main>

      <MobileTabBar />
    </>
  );
}
