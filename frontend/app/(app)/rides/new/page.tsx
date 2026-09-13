"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, Car, Loader2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { DateField } from "@/components/date-field";
import { SelectField, TimeField } from "@/components/form-fields";
import { EmptyState, ErrorState, FormError, Skeleton } from "@/components/status-blocks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fuelTypeLabel } from "@/components/vehicle-picker";
import {
  ApiError,
  CAMPUS_OPTIONS,
  createRide,
  getMyVehicles,
  type Campus,
  type Vehicle,
} from "@/lib/api";
import { todayMelbourne, toMelbourneInstant } from "@/lib/time";
import { useQuery } from "@/lib/use-query";
import { cn } from "@/lib/utils";

/**
 * Post a drive - one page, not a wizard (artboard 1h).
 *
 * Needs a registered car: the ride is tied to one, and the backend refuses a
 * ride against a car the caller does not own. No car means the form is
 * replaced by a pointer to /vehicles rather than a form that cannot submit.
 */
export default function PostDrivePage() {
  const vehicles = useQuery((token) => getMyVehicles({ token }), []);

  return (
    <AppShell title="Post a drive">
      {vehicles.status === "loading" && <Skeleton rows={1} lines={4} />}
      {vehicles.status === "error" && (
        <ErrorState message="Couldn't load your cars." onRetry={vehicles.reload} />
      )}
      {vehicles.status === "ready" && vehicles.data && vehicles.data.length === 0 && (
        <EmptyState
          icon={Car}
          title="Add a car first"
          body="A drive is posted against one of your cars."
          action={
            <Button size="lg" asChild>
              <Link href="/vehicles">
                My cars
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        />
      )}
      {vehicles.status === "ready" && vehicles.data && vehicles.data.length > 0 && (
        <PostDriveForm vehicles={vehicles.data} />
      )}
    </AppShell>
  );
}

const SEAT_OPTIONS = [1, 2, 3, 4];

interface Draft {
  vehicleId: string;
  origin: Campus | "";
  destination: Campus | "";
  date: string;
  time: string;
  seats: number;
}

function PostDriveForm({ vehicles }: { vehicles: Vehicle[] }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [draft, setDraft] = useState<Draft>({
    // One car needs no choosing
    vehicleId: vehicles.length === 1 ? vehicles[0].id : "",
    origin: "",
    destination: "",
    date: todayMelbourne(),
    time: "",
    seats: 2,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read once at mount: the clock is not allowed inside render. A form left
  // open past its own departure time is caught by the backend's 400 instead.
  const [openedAt] = useState(() => Date.now());

  const sameCampus = draft.origin !== "" && draft.origin === draft.destination;
  const departure =
    draft.date && draft.time ? toMelbourneInstant(draft.date, draft.time) : null;
  const inPast = departure !== null && new Date(departure).getTime() <= openedAt;
  const ready =
    draft.vehicleId !== "" &&
    draft.origin !== "" &&
    draft.destination !== "" &&
    !sameCampus &&
    departure !== null &&
    !inPast;

  const submit = async () => {
    if (!ready || !departure || draft.origin === "" || draft.destination === "") return;
    setError(null);
    setSaving(true);
    try {
      const ride = await createRide(
        {
          vehicle_id: draft.vehicleId,
          origin: draft.origin,
          destination: draft.destination,
          departure_at: departure,
          total_seats: draft.seats,
        },
        { token: await getToken() },
      );
      router.replace(`/rides/${ride.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status < 500
          ? caught.message
          : "Couldn't post the drive. Please try again.",
      );
      setSaving(false);
    }
  };

  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: `${v.make} ${v.model} · ${fuelTypeLabel(v.fuel_type)}`,
  }));

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Card className="gap-3.5 p-3.5">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <SelectField
            label="From"
            placeholder="Campus"
            options={CAMPUS_OPTIONS}
            value={draft.origin}
            onValueChange={(v) => setDraft({ ...draft, origin: v as Campus })}
          />
          <SelectField
            label="To"
            placeholder="Campus"
            options={CAMPUS_OPTIONS}
            value={draft.destination}
            onValueChange={(v) => setDraft({ ...draft, destination: v as Campus })}
          />
        </div>
        {sameCampus && <p className="text-xs text-destructive">Pick two different campuses.</p>}

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <DateField
            label="Date"
            min={todayMelbourne()}
            value={draft.date}
            onChange={(date) => setDraft({ ...draft, date })}
          />
          <TimeField
            label="Departs"
            value={draft.time}
            onValueChange={(time) => setDraft({ ...draft, time })}
          />
        </div>
        {inPast && <p className="text-xs text-destructive">That time has already passed.</p>}
      </Card>

      <Card className="gap-3.5 p-3.5">
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium">Seats offered</legend>
          <div className="grid grid-cols-4 gap-2">
            {SEAT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={draft.seats === n}
                onClick={() => setDraft({ ...draft, seats: n })}
                className={cn(
                  "rounded-lg border py-2.5 text-sm font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-eco",
                  draft.seats === n
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>

        {vehicles.length > 1 ? (
          <SelectField
            label="Car"
            placeholder="Choose a car"
            options={vehicleOptions}
            value={draft.vehicleId}
            onValueChange={(v) => setDraft({ ...draft, vehicleId: v })}
          />
        ) : (
          <div>
            <p className="mb-1.5 text-sm font-medium">Car</p>
            <p className="text-sm text-muted-foreground">{vehicleOptions[0].label}</p>
          </div>
        )}
      </Card>

      {error && <FormError>{error}</FormError>}

      <Button type="submit" size="lg" className="h-11 w-full sm:w-auto sm:self-end" disabled={saving || !ready}>
        {saving && <Loader2 className="animate-spin" aria-hidden />}
        {saving ? "Posting" : "Post drive"}
      </Button>
    </form>
  );
}
