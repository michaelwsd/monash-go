"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Car, Fuel, Loader2, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, FormError, Skeleton } from "@/components/status-blocks";
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
import { useQuery } from "@/lib/use-query";

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
  const vehicles = useQuery((token) => getMyVehicles({ token }), []);
  const [adding, setAdding] = useState(false);

  return (
    <AppShell
      title="My cars"
      subtitle="A registered car is what lets you offer seats on a trip."
      action={
        vehicles.data && vehicles.data.length > 0 ? (
          <Button size="lg" className="w-full sm:w-auto" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add a car
          </Button>
        ) : undefined
      }
    >
      <AddVehicleDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={(vehicle) => {
          setAdding(false);
          // Prepend rather than refetch: the list is newest first, and the
          // response is the stored row, so it is already authoritative.
          vehicles.setData([vehicle, ...(vehicles.data ?? [])]);
        }}
      />

      <div className="flex flex-col gap-3.5">
        {vehicles.status === "loading" && <Skeleton rows={2} />}
        {vehicles.status === "error" && (
          <ErrorState message="Couldn't load your cars." onRetry={vehicles.reload} />
        )}
        {vehicles.data?.length === 0 && (
          <EmptyState
            icon={Car}
            title="No cars registered yet"
            body="Add one and its fuel use is filled in from the reference data."
            action={
              <Button size="lg" onClick={() => setAdding(true)}>
                <Plus aria-hidden />
                Add a car
              </Button>
            }
          />
        )}
        {vehicles.data?.map((vehicle) => (
          <VehicleCard key={vehicle.id} vehicle={vehicle} />
        ))}
      </div>
    </AppShell>
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
      <DialogContent className="max-h-[85svh] sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add a car</DialogTitle>
        </DialogHeader>

        {/* flex-initial, not the base flex-1: the body takes its height from
            its content instead of stretching, which is what lets the dialog
            collapse. min-h-0 keeps it able to shrink at the ceiling. */}
        <DialogBody className="flex min-h-0 flex-initial flex-col overflow-hidden pb-1">
          <VehiclePicker value={car} onChange={setCar} className="min-h-0" />

          {error && <FormError className="mt-3 shrink-0">{error}</FormError>}
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
