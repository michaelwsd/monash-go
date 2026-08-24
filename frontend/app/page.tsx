import { ArrowRight, MapPin, MessageSquare } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { Co2Sparkline } from "@/components/co2-sparkline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  comparison,
  impact,
  nextTrip,
  rewards,
  suggestedRides,
  weeklyCo2Kg,
} from "@/lib/fake-dashboard";

const LABEL =
  "text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase";

/**
 * Home dashboard. Follows artboard 1f of "MonashGo Wireframes v2":
 * "next trip first, then quick actions, then cumulative impact. Pet reduced to
 * a points badge in the nav, per your call."
 *
 * Every figure on this page comes from lib/fake-dashboard.ts and is a
 * placeholder. Nothing here talks to the backend yet.
 *
 * proxy.ts protects this route, so reaching it at all means a valid session.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col bg-muted/40">
      <AppHeader greenPoints={rewards.greenPoints} />

      <main className="mx-auto w-full max-w-[900px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
        {/* One column on a phone; the design's 1.5fr / 1fr split from sm up. */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[1.5fr_1fr]">
          <Card className="gap-0 p-3.5 sm:col-span-2">
            <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                  Next trip &middot; {nextTrip.when}
                </p>
                <p className="mt-0.5 text-xl font-semibold tracking-[-0.025em] tabular-nums">
                  {nextTrip.departsAt} {nextTrip.origin} &rarr;{" "}
                  {nextTrip.destination}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <span>{nextTrip.driver}</span>
                  <span aria-hidden>&middot;</span>
                  <span>{nextTrip.vehicle}</span>
                  <span aria-hidden>&middot;</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" aria-hidden />
                    meet at {nextTrip.meetingPoint}
                  </span>
                </p>
              </div>

              <div className="flex gap-2 sm:ml-auto">
                <Button variant="outline" size="lg" className="flex-1 sm:flex-none">
                  <MessageSquare aria-hidden />
                  Message
                </Button>
                <Button size="lg" className="flex-1 sm:flex-none">
                  View trip
                </Button>
              </div>
            </div>
          </Card>

          <Card className="gap-0 p-3.5">
            <p className="text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
              Your impact
            </p>

            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
              <div>
                <dd className="text-2xl font-semibold tracking-[-0.025em] text-eco-foreground tabular-nums">
                  {impact.co2AvoidedKg} kg
                </dd>
                <dt className="text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                  CO&#8322; avoided
                </dt>
              </div>
              <div>
                <dd className="text-2xl font-semibold tracking-[-0.025em] tabular-nums">
                  {impact.sharedTrips}
                </dd>
                <dt className="text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                  shared trips
                </dt>
              </div>
              <div>
                <dd className="text-2xl font-semibold tracking-[-0.025em] tabular-nums">
                  ${impact.dollarsSaved}
                </dd>
                <dt className="text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                  saved
                </dt>
              </div>
            </dl>

            <Co2Sparkline weeklyKg={weeklyCo2Kg} className="mt-3" />
            <p className="mt-1.5 text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
              CO&#8322; avoided per week &middot; last {weeklyCo2Kg.length} weeks
            </p>
          </Card>

          <div className="flex flex-col gap-2.5">
            <Button size="lg" className="h-11 w-full justify-center">
              Find a ride
              <ArrowRight aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11 w-full justify-center"
            >
              Post a drive
            </Button>

            <Card className="gap-0 p-2.75">
              <p className="text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                Rewards
              </p>
              <p className="mt-1.5 text-xs tabular-nums">
                {rewards.greenPoints.toLocaleString()} pts &middot;{" "}
                {rewards.pointsToNextStage} to next pet stage
              </p>
              <Progress
                value={rewards.stageProgressPercent}
                className="mt-1.5 h-2 [&>*]:bg-eco"
              />
            </Card>
          </div>
        </div>

        {/* Ride cards, following artboard 1a. */}
        <section className="mt-3.5">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-semibold">
              Rides on your usual route
            </h2>
            <span className="text-xs text-muted-foreground">
              Clayton &rarr; Caulfield &middot; tomorrow
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {suggestedRides.map((ride) => {
              const full = ride.seatsLeft === 0;
              return (
                <Card
                  key={ride.id}
                  className={`flex-row items-center gap-3 p-3 ${full ? "opacity-55" : ""}`}
                >
                  <div className="min-w-[52px] text-center">
                    <p className="text-lg font-semibold tracking-[-0.025em] tabular-nums">
                      {ride.departsAt}
                    </p>
                    <p className={LABEL}>{ride.durationMin} min</p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">
                      {ride.driver} &middot; {ride.vehicle}
                    </p>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      {full
                        ? "Full - 0 seats left"
                        : `${ride.route} · ${ride.seatsLeft} of ${ride.totalSeats} seats left`}
                    </p>
                    {!full && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 text-[11.5px] tabular-nums">
                        <span className="font-semibold text-eco-foreground">
                          {ride.co2PerPersonKg.toFixed(2)} kg CO&#8322;
                        </span>
                        <span>~${ride.costPerPerson.toFixed(2)} ea.</span>
                        <span className="hidden text-muted-foreground sm:inline">
                          saves {ride.co2SavedKg.toFixed(2)} kg
                        </span>
                      </p>
                    )}
                  </div>

                  <Button
                    variant={full ? "outline" : "default"}
                    size="lg"
                    className="shrink-0"
                  >
                    {full ? "Waitlist" : "Book"}
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Requirement 4, in miniature: the same trip priced three ways. */}
        <section className="mt-3.5">
          <h2 className="mb-2 text-[13px] font-semibold">
            Tomorrow&rsquo;s trip, three ways
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {comparison.map((row) => (
              <Card
                key={row.mode}
                className={`gap-0 p-3 ${row.best ? "border-eco-border bg-eco-muted" : ""}`}
              >
                <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                  {row.mode}
                  {row.best && (
                    <span className="rounded-full bg-eco px-1.5 py-px text-[9px] font-semibold tracking-wide text-white uppercase">
                      Best
                    </span>
                  )}
                </p>
                <dl className="mt-2 flex gap-4">
                  <div>
                    <dd className="text-base font-semibold tabular-nums">
                      {row.minutes}m
                    </dd>
                    <dt className={LABEL}>time</dt>
                  </div>
                  <div>
                    <dd className="text-base font-semibold tabular-nums">
                      ${row.cost.toFixed(2)}
                    </dd>
                    <dt className={LABEL}>cost</dt>
                  </div>
                  <div>
                    {/* Deliberately not green. Tinting every row's CO2 figure
                        eco-green puts an approving colour on "drive alone",
                        which is the worst option here. The Best badge and the
                        tinted card carry the judgement; the numbers stay ink. */}
                    <dd className="text-base font-semibold tabular-nums">
                      {row.co2Kg.toFixed(2)}
                    </dd>
                    <dt className={LABEL}>kg CO&#8322;</dt>
                  </div>
                </dl>
              </Card>
            ))}
          </div>
        </section>

        <p className="mt-3.5 rounded-md border bg-muted/50 p-3 text-[11.5px]/[1.5] text-muted-foreground">
          Placeholder data. Every figure on this page comes from{" "}
          <code className="font-mono">lib/fake-dashboard.ts</code> - nothing is
          fetched from the API yet.
        </p>
      </main>
    </div>
  );
}
