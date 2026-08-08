import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssumptionsNote } from "@/components/compare/assumptions-note";
import { ComparisonGrid } from "@/components/compare/comparison-grid";
import { TransitLegs } from "@/components/compare/transit-legs";
import { BookingPanel } from "@/components/rides/booking-panel";
import { DriverCard } from "@/components/rides/driver-card";
import { RouteStrip } from "@/components/rides/route-strip";
import { Callout, Icon } from "@/components/ui";
import { getRideDetail } from "@/lib/data/queries";
import { formatDayTime, formatRoute } from "@/lib/format";

interface PageProps {
  params: Promise<{ rideId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { rideId } = await params;
  const detail = await getRideDetail(rideId);
  if (!detail) return { title: "Ride not found" };

  return {
    title: formatRoute(detail.ride.origin, detail.ride.destination),
  };
}

/**
 * Wireframe 1g — ride detail and comparison dashboard.
 *
 * The comparison is the body of the page, not a separate screen. That is the
 * wireframe's call and it is the right one: requirement 4 asks for a comparison
 * dashboard, and a dashboard nobody navigates to does not satisfy it. Putting it
 * on the page a passenger already has to visit to book means every booking
 * passes through the emissions argument.
 *
 * `params` is awaited because it is a Promise in this version of Next.
 * `notFound()` renders the 404 rather than crashing on a stale link.
 */
export default async function RideDetailPage({ params }: PageProps) {
  const { rideId } = await params;
  const detail = await getRideDetail(rideId);

  if (!detail) notFound();

  const { ride, driver, vehicle, comparison } = detail;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/rides"
        className="inline-flex items-center gap-1 self-start text-sm text-ink/65 no-underline hover:text-clay-700"
      >
        <Icon as={ArrowLeft} size={15} />
        Back to results
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <header>
            <h1 className="text-2xl sm:text-[32px]">
              {formatRoute(ride.origin, ride.destination)}
            </h1>
            <p className="mt-1 text-sm text-ink/70">
              {formatDayTime(ride.departureAt)}
            </p>
          </header>

          <RouteStrip
            origin={ride.origin}
            destination={ride.destination}
            distanceKm={ride.distanceKm}
            durationMin={detail.durationMin}
            pickupPoint={detail.pickupPoint}
          />

          <section className="flex flex-col gap-3">
            <h2 className="text-lg">How this compares</h2>
            <ComparisonGrid options={comparison.options} />
          </section>

          <TransitLegs legs={comparison.transitLegs} />

          {detail.note ? (
            <Callout tone="muted">
              <span className="label">Note from {driver.displayName}</span>
              <p className="m-0 mt-1">{detail.note}</p>
            </Callout>
          ) : null}

          <AssumptionsNote comparison={comparison} />
        </div>

        {/* On a phone this stack sits under the comparison; from `lg` it becomes
            the right rail the wireframe pins the booking action to. */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
          <BookingPanel
            ride={ride}
            costPerPersonAud={detail.costPerPersonAud}
            co2AvoidedKg={detail.co2AvoidedKg}
            viewerBookingId={detail.viewerBookingId}
          />
          <DriverCard driver={driver} vehicle={vehicle} />
        </aside>
      </div>
    </div>
  );
}
