import { BadgeCheck, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import {
  Avatar,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardKicker,
  ChoiceGroup,
  Field,
  GhostPanel,
  Icon,
  Select,
  Tag,
} from "@/components/ui";
import { updateProfile } from "@/lib/actions/users";
import { getCurrentUser, getMyVehicles } from "@/lib/data/queries";
import { MYKI_FARE } from "@/lib/emissions";
import { formatCampus, formatConsumption, formatVehicle } from "@/lib/format";
import { CAMPUSES } from "@/lib/types";

export const metadata: Metadata = {
  title: "Profile",
};

const ON_OFF = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

/**
 * Wireframe 1m — profile and settings.
 *
 * A Server Component with a plain form posting to a Server Action. Nothing here
 * needs client state: the toggles are radio pairs, the campus is a select, and
 * the commit point is the Save button. No `useState`, no controlled inputs, and
 * the page works before JavaScript loads.
 *
 * The concession toggle carries a sentence explaining what it changes, because it
 * does not merely record a fact about the user — it picks the fare used in every
 * comparison on the site.
 */
export default async function ProfilePage() {
  const [user, vehicles] = await Promise.all([getCurrentUser(), getMyVehicles()]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <PageHeader
        title="Profile"
        actions={
          <Button variant="ghost" size="md">
            Sign out
          </Button>
        }
      />

      <Card className="gap-3 p-4 sm:flex-row sm:items-center">
        <Avatar name={user.fullName} size="lg" />
        <div className="min-w-0">
          <p className="m-0 font-display text-lg leading-tight">{user.fullName}</p>
          <p className="m-0 text-xs break-all text-ink/70">{user.email}</p>
          <Tag tone="sage" className="mt-2">
            <Icon as={BadgeCheck} size={12} />
            Verified Monash {user.email.includes("student.") ? "student" : "staff"}
          </Tag>
        </div>
      </Card>

      <Card className="gap-4 p-4">
        <CardKicker>Settings</CardKicker>

        <form action={updateProfile} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">Concession myki holder</span>
              <ChoiceGroup
                name="isConcession"
                legend="Concession myki holder"
                options={ON_OFF}
                defaultValue={user.isConcession ? "on" : "off"}
              />
            </div>
            <p className="m-0 text-xs text-ink/60">
              Sets the public-transport fare used in every comparison — $
              {MYKI_FARE.concession.toFixed(2)} concession against $
              {MYKI_FARE.full.toFixed(2)} full.
            </p>
          </div>

          <Field
            label="Home campus"
            htmlFor="profile-campus"
            hint="Used to prefill the search when you open Find a ride."
          >
            <Select id="profile-campus" name="homeCampus" defaultValue="clayton">
              {CAMPUSES.map((campus) => (
                <option key={campus} value={campus}>
                  {formatCampus(campus)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">Ride reminders</span>
            <ChoiceGroup
              name="rideReminders"
              legend="Ride reminders"
              options={ON_OFF}
              defaultValue="on"
            />
          </div>

          <Button type="submit" variant="primary" size="lg" fullWidth>
            Save settings
          </Button>
        </form>
      </Card>

      <section>
        <h2 className="text-lg">Your vehicles</h2>

        {vehicles.length > 0 ? (
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {vehicles.map((vehicle) => (
              <Card
                as="li"
                key={vehicle.id}
                className="gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm">
                  <span className="font-semibold">
                    {formatVehicle(vehicle)} {vehicle.year}
                  </span>
                  <span className="text-ink/60">
                    {" "}
                    ·{" "}
                    {formatConsumption(vehicle.fuelConsumption, vehicle.fuelType)}
                  </span>
                </span>
                <ButtonLink
                  href={`/vehicles/new?make=${encodeURIComponent(vehicle.make)}&model=${encodeURIComponent(vehicle.model)}&year=${vehicle.year}&fuel=${vehicle.fuelType}&consumption=${vehicle.fuelConsumption}`}
                  variant="secondary"
                  size="sm"
                >
                  Edit
                </ButtonLink>
              </Card>
            ))}
          </ul>
        ) : (
          <GhostPanel className="mt-2 text-sm">
            No cars yet. You only need one to offer seats — riding needs nothing.
          </GhostPanel>
        )}

        <ButtonLink
          href="/vehicles/new"
          variant="secondary"
          size="lg"
          fullWidth
          className="mt-2"
        >
          Add another vehicle
        </ButtonLink>
      </section>

      <Callout tone="muted" className="flex items-start gap-2">
        <Icon as={ShieldCheck} size={15} className="mt-0.5 text-sage-700" />
        <span>
          Your phone number is only shown to riders after they book a seat with
          you. MonashGo never tracks your location — routes shown in the app are
          planned paths, not live positions.
        </span>
      </Callout>
    </div>
  );
}
