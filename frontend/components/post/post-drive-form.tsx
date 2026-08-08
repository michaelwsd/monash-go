"use client";

import { useMemo, useState } from "react";

import {
  Button,
  Card,
  CardKicker,
  ChoiceGroup,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { postDrive } from "@/lib/actions/rides";
import {
  co2AvoidedKg,
  co2PerOccupantKg,
  co2SoloKg,
  costPerPassengerAud,
  costSoloAud,
  pointsFor,
  type FuelPrices,
} from "@/lib/emissions";
import {
  formatCampus,
  formatCo2,
  formatConsumption,
  formatDuration,
  formatMoney,
  formatPoints,
  formatVehicle,
} from "@/lib/format";
import { CAMPUSES, type Campus, type Vehicle } from "@/lib/types";

interface PostDriveFormProps {
  vehicles: Vehicle[];
  driveRoutes: Record<string, { distanceKm: number; durationMin: number }>;
  fuelPrices: FuelPrices;
}

const SEAT_OPTIONS = ["1", "2", "3", "4"].map((value) => ({ value, label: value }));

/**
 * Wireframe 1h — post a drive.
 *
 * One page, not a wizard, per the wireframe. The reason it works as one page is
 * the preview at the bottom: the driver can see the consequence of every field
 * without committing, so there is nothing for a wizard's steps to protect them
 * from.
 *
 * The preview is why this is a Client Component and why `lib/emissions.ts`
 * exists on the client at all. There is no ride yet, so `GET /compare/{ride_id}`
 * cannot answer "what will riders see?" — and a request per keystroke would be a
 * poor answer even if it could. The arithmetic is pure functions over numbers,
 * so running it in both places is safe; the authoritative figures are still
 * written server-side when the ride completes.
 *
 * `useMemo` guards the recompute, and every value the preview needs is either
 * local state or a prop, so there is no effect and no fetch in this component.
 */
export function PostDriveForm({
  vehicles,
  driveRoutes,
  fuelPrices,
}: PostDriveFormProps) {
  const [origin, setOrigin] = useState<Campus>("clayton");
  const [destination, setDestination] = useState<Campus>("caulfield");
  const [seats, setSeats] = useState("3");
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");

  const vehicle = vehicles.find((candidate) => candidate.id === vehicleId);
  const sameCampus = origin === destination;
  const route = driveRoutes[`${origin}:${destination}`];

  const preview = useMemo(() => {
    if (!vehicle || !route || sameCampus) return null;

    // The preview assumes every offered seat fills. That is the optimistic case,
    // and it is labelled as such below rather than presented as a promise.
    const passengers = Number(seats);
    const occupants = passengers + 1;

    const soloKg = co2SoloKg(
      route.distanceKm,
      vehicle.fuelConsumption,
      vehicle.fuelType,
    );
    const soloAud = costSoloAud(
      route.distanceKm,
      vehicle.fuelConsumption,
      vehicle.fuelType,
      fuelPrices,
    );
    const avoided = co2AvoidedKg(passengers, route.distanceKm, soloKg);

    return {
      passengers,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      perPersonKg: co2PerOccupantKg(soloKg, occupants),
      perPersonAud: costPerPassengerAud(soloAud, passengers),
      avoidedKg: avoided,
      points: pointsFor(avoided),
    };
  }, [vehicle, route, sameCampus, seats, fuelPrices]);

  return (
    <form action={postDrive} className="flex flex-col gap-4">
      <Card className="gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From" htmlFor="post-origin">
            <Select
              id="post-origin"
              name="origin"
              value={origin}
              onChange={(event) => setOrigin(event.target.value as Campus)}
            >
              {CAMPUSES.map((campus) => (
                <option key={campus} value={campus}>
                  {formatCampus(campus)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="To"
            htmlFor="post-destination"
            error={sameCampus ? "Pick a different campus to drive to." : undefined}
          >
            <Select
              id="post-destination"
              name="destination"
              value={destination}
              onChange={(event) => setDestination(event.target.value as Campus)}
            >
              {CAMPUSES.map((campus) => (
                <option key={campus} value={campus}>
                  {formatCampus(campus)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date" htmlFor="post-date">
            <Input id="post-date" name="date" type="date" defaultValue="2026-08-10" required />
          </Field>

          <Field label="Departs" htmlFor="post-time">
            <Input id="post-time" name="time" type="time" defaultValue="08:15" required />
          </Field>
        </div>

        <div>
          <p className="label mb-1">Seats offered</p>
          <ChoiceGroup
            name="seats"
            legend="Seats offered"
            options={SEAT_OPTIONS}
            value={seats}
            onChange={setSeats}
          />
        </div>

        <Field
          label="Vehicle"
          htmlFor="post-vehicle"
          hint={
            vehicle
              ? formatConsumption(vehicle.fuelConsumption, vehicle.fuelType)
              : undefined
          }
        >
          <Select
            id="post-vehicle"
            name="vehicleId"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
            required
          >
            {vehicles.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {formatVehicle(candidate)} {candidate.year}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Pick-up point (optional)" htmlFor="post-pickup">
          <Input
            id="post-pickup"
            name="pickupPoint"
            placeholder="Clayton Bus Loop, bay 3"
          />
        </Field>

        <Field label="Note to riders (optional)" htmlFor="post-note">
          <Textarea
            id="post-note"
            name="note"
            placeholder="Leaving on time — no food in the car please."
          />
        </Field>
      </Card>

      {/* The live preview. Sage-tinted because everything in it is the green
          story, and it is the argument for offering the seats at all. */}
      <Card className="gap-2 bg-sage-100 p-4">
        <CardKicker className="text-sage-800">Riders will see</CardKicker>

        {preview ? (
          <>
            <p className="m-0 text-sm leading-relaxed text-sage-900">
              <strong>{formatCo2(preview.perPersonKg)} CO₂</strong> each ·{" "}
              <strong>{formatMoney(preview.perPersonAud)}</strong> each ·{" "}
              {formatDuration(preview.durationMin)} over{" "}
              {preview.distanceKm.toFixed(1)} km
            </p>
            <p className="m-0 text-sm leading-relaxed text-sage-900">
              With all {preview.passengers}{" "}
              {preview.passengers === 1 ? "seat" : "seats"} filled you avoid{" "}
              <strong>{formatCo2(preview.avoidedKg)}</strong> versus everyone
              driving alone, worth about {formatPoints(preview.points)} green
              points.
            </p>
            <p className="m-0 text-xs text-sage-800/80">
              Assumes every seat fills. The figure that counts is calculated from
              the real passenger count when you mark the trip complete.
            </p>
          </>
        ) : (
          <p className="m-0 text-sm text-sage-900">
            {sameCampus
              ? "Choose two different campuses to see the preview."
              : "No cached route for this pair yet, so the preview is unavailable."}
          </p>
        )}
      </Card>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={sameCampus || !vehicle}
      >
        Post drive
      </Button>
    </form>
  );
}
