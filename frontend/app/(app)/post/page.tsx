import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PostDriveForm } from "@/components/post/post-drive-form";
import { ButtonLink, GhostPanel } from "@/components/ui";
import { getDriveRoutes, getFuelPrices, getMyVehicles } from "@/lib/data/queries";

export const metadata: Metadata = {
  title: "Post a drive",
};

/**
 * Wireframe 1h — post a drive.
 *
 * A thin Server Component: it fetches the three things the form needs and hands
 * them over. The interactive work lives in `PostDriveForm`, so the data fetching
 * stays on the server and the client bundle contains the form and nothing else.
 *
 * A driver with no vehicle is sent to registration first. Offering a seat needs a
 * fuel-consumption figure — without one there is no emissions estimate, which is
 * the entire point of the listing.
 */
export default async function PostDrivePage() {
  const [vehicles, driveRoutes, fuelPrices] = await Promise.all([
    getMyVehicles(),
    getDriveRoutes(),
    getFuelPrices(),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader
        title="Post a drive"
        subtitle="Riders see the emissions and cost split before they book."
      />

      {vehicles.length === 0 ? (
        <GhostPanel className="flex flex-col items-start gap-3 p-5">
          <p className="m-0 text-sm">
            Add a car first. The emissions and cost estimates riders see are
            calculated from its fuel consumption, so a listing without one cannot
            be compared against transport or driving solo.
          </p>
          <ButtonLink href="/vehicles/new" variant="primary" size="lg">
            Add your car
          </ButtonLink>
        </GhostPanel>
      ) : (
        <PostDriveForm
          vehicles={vehicles}
          driveRoutes={driveRoutes}
          fuelPrices={fuelPrices}
        />
      )}
    </div>
  );
}
