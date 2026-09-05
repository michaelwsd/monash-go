"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { AlertCircle, Car, Fuel, Loader2, Plus } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import VehiclePicker, {
  EMPTY_CAR,
  fuelTypeLabel,
  isCarUsable,
  type CarDetails,
} from "@/components/vehicle-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ApiError,
  consumptionUnit,
  createVehicle,
  getMyVehicles,
  type Vehicle,
} from "@/lib/api";
import { useCurrentUser } from "@/lib/use-current-user";

const LABEL =
  "text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase";

/**
 * My cars. Lists GET /vehicles/me and adds to it with POST /vehicles.
 *
 * Registering the first car is also what promotes a passenger to a driver on
 * the backend, which is what POST /rides needs to accept anything. That makes
 * this page a prerequisite for posting a ride, not a settings afterthought.
 */
export default function VehiclesPage() {
  const { getToken } = useAuth();
  const { user } = useCurrentUser();

  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [attempt, setAttempt] = useState(0);

  /* The fetch lives inside the effect rather than in a useCallback the effect
     invokes. React 19's set-state-in-effect rule traces through a called
     function and flags the setState at the far end of it, and the retry button
     only needs to nudge a counter to run this again. Same shape as
     useCurrentUser. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const rows = await getMyVehicles({ token: await getToken() });
        if (cancelled) return;
        setVehicles(rows);
        setLoadError(false);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // getToken has no stable identity from Clerk, so it stays out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = () => {
    setLoadError(false);
    setAttempt((n) => n + 1);
  };

  return (
    <div className="flex flex-1 flex-col bg-muted/40">
      <AppHeader greenPoints={user?.green_points ?? 0} />

      <main className="mx-auto w-full max-w-[900px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
        {/* Stacks below sm. Side by side at 375px the heading loses so much
            width that "A registered car is what lets you offer seats" wraps to
            three lines beside a button. */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.025em]">
              My cars
            </h1>
          </div>

          {vehicles !== null && vehicles.length > 0 && (
            <Button
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => setAdding(true)}
            >
              <Plus aria-hidden />
              Add a car
            </Button>
          )}
        </div>

        <AddVehicleDialog
          open={adding}
          onOpenChange={setAdding}
          onAdded={(vehicle) => {
            setAdding(false);
            // Prepend rather than refetch: the list is newest first, and the
            // response is the stored row, so it is already authoritative.
            setVehicles((current) => [vehicle, ...(current ?? [])]);
          }}
        />

        <div className="flex flex-col gap-3.5">
          {vehicles === null && !loadError && <VehiclesSkeleton />}

          {loadError && (
            <Card className="items-center gap-2 p-8 text-center">
              <AlertCircle className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">We couldn&apos;t load your cars.</p>
              <Button variant="outline" size="lg" onClick={retry}>
                Try again
              </Button>
            </Card>
          )}

          {vehicles?.length === 0 && (
            <Card className="items-center gap-2 p-8 text-center">
              <Car className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">No cars registered yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Add one and we&apos;ll fill in its fuel use from the reference
                data, so your trip&apos;s emissions are worked out for you.
              </p>
              <Button size="lg" className="mt-1" onClick={() => setAdding(true)}>
                <Plus aria-hidden />
                Add a car
              </Button>
            </Card>
          )}

          {vehicles?.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      </main>
    </div>
  );
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const unit = consumptionUnit(vehicle.fuel_type);
  const electric = vehicle.fuel_type === "electric";

  return (
    <Card className="gap-0 p-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className={LABEL}>{vehicle.year}</p>
          <p className="mt-0.5 truncate text-base font-semibold tracking-[-0.02em]">
            {vehicle.make} {vehicle.model}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Badge variant="secondary" className="gap-1 rounded-full font-medium">
            <Fuel className="size-3" aria-hidden />
            {fuelTypeLabel(vehicle.fuel_type)}
          </Badge>
          {/* An EV emits nothing at the tailpipe, so its figure is the one
              worth colouring - and it is in kWh, not litres. */}
          <Badge
            variant={electric ? "outline" : "secondary"}
            className={`rounded-full font-medium tabular-nums ${
              electric ? "border-eco-border bg-eco-muted text-eco-foreground" : ""
            }`}
          >
            {vehicle.fuel_consumption} {unit}
          </Badge>
        </div>
      </div>
    </Card>
  );
}

function VehiclesSkeleton() {
  return (
    <>
      {[0, 1].map((row) => (
        <Card key={row} className="gap-0 p-3.5" aria-hidden>
          <div className="flex animate-pulse items-center gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-2 w-10 rounded bg-muted" />
              <div className="h-4 w-40 rounded bg-muted" />
            </div>
            <div className="h-5 w-16 rounded-full bg-muted" />
          </div>
        </Card>
      ))}
    </>
  );
}

function AddVehicleDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (vehicle: Vehicle) => void;
}) {
  const { getToken } = useAuth();
  const [car, setCar] = useState<CarDetails>(EMPTY_CAR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const vehicle = await createVehicle(
        {
          make: car.make.trim(),
          model: car.model.trim(),
          year: Number(car.year),
          // "" is unreachable: the button is gated on isCarUsable, which
          // requires a fuel type.
          fuel_type: car.fuelType || "petrol",
          fuel_consumption: Number(car.fuelConsumption),
          reference_id: car.referenceId,
        },
        { token: await getToken() },
      );
      onAdded(vehicle);
      setCar(EMPTY_CAR);
    } catch (caught) {
      // A 4xx says something useful about what was sent; a 5xx says nothing a
      // driver can act on, so it gets the generic line.
      setError(
        caught instanceof ApiError && caught.status < 500
          ? caught.message
          : "We couldn't save that car. Please try again.",
      );
    }
    setSaving(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reset on close so reopening is not haunted by a half-typed car or a
        // stale error from last time.
        if (!next) {
          setCar(EMPTY_CAR);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      {/* Wider than the default dialog: the search results carry a name, a
          fuel chip and a consumption figure on one line, and at max-w-lg the
          name truncates before it has said which model it is.

          Fitted to its content, so with nothing searched the panel is just the
          four fields rather than a tall box of empty space. It grows by the
          height of the results list while someone is choosing, and shrinks
          back once they pick.

          max-h-[85svh] is the ceiling, and the flex sizing inside is what
          makes it safe: past that height the results list is the only thing
          that can shrink, so the fuel fields and the Save button stay on
          screen. svh rather than vh, which ignores the browser's own chrome
          and overshoots on mobile Safari. */}
      <DialogContent className="max-h-[85svh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a car</DialogTitle>
        </DialogHeader>

        {/* flex-initial, not the base flex-1: the body takes its height from
            its content instead of stretching, which is what lets the dialog
            collapse. min-h-0 keeps it able to shrink at the ceiling. */}
        <DialogBody className="flex min-h-0 flex-initial flex-col overflow-hidden pb-1">
          <VehiclePicker value={car} onChange={setCar} className="min-h-0" />

          {error && (
            <p
              role="alert"
              className="mt-3 flex shrink-0 items-start gap-2 rounded-lg border border-destructive-border bg-destructive-muted px-3 py-2.5 text-xs text-destructive"
            >
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            size="lg"
            onClick={() => void submit()}
            disabled={saving || !isCarUsable(car)}
          >
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            {saving ? "Saving" : "Save car"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
