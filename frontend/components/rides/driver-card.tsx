import { BadgeCheck, PhoneOff } from "lucide-react";

import { Avatar, Card, Icon, Tag } from "@/components/ui";
import { formatConsumption, formatFuelType, formatVehicle } from "@/lib/format";
import type { DriverPreview, Vehicle } from "@/lib/types";

interface DriverCardProps {
  driver: DriverPreview;
  vehicle: Vehicle;
}

/**
 * Who is driving, and what they are driving.
 *
 * The type is `DriverPreview`, which has no `phone` field at all. That is the
 * privacy rule expressed in the type system rather than in a conditional: this
 * component *cannot* leak a phone number before booking, because it was never
 * handed one. Only `getBookingConfirmation` returns a `DriverContact`.
 *
 * Consumption is printed through `formatConsumption`, which takes the fuel type
 * — the units are L/100km or kWh/100km depending on it, and Daniel's MG ZS EV
 * would otherwise read as a car that drinks 17 litres per 100 km.
 */
export function DriverCard({ driver, vehicle }: DriverCardProps) {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={driver.displayName} src={driver.avatarUrl} size="lg" />
        <div className="min-w-0">
          <p className="font-display text-base leading-tight">{driver.displayName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink/65">
            {driver.verified ? (
              <>
                <Icon as={BadgeCheck} size={13} className="text-sage-700" />
                Verified Monash
              </>
            ) : null}
          </p>
          <p className="text-xs text-ink/65">{driver.completedRides} rides</p>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">{formatVehicle(vehicle)}</span>
        <span className="text-xs text-ink/65">
          {vehicle.year} · {formatFuelType(vehicle.fuelType)} ·{" "}
          {formatConsumption(vehicle.fuelConsumption, vehicle.fuelType)}
        </span>
      </div>

      <Tag tone="neutral" className="self-start">
        <Icon as={PhoneOff} size={12} />
        Phone shown after booking
      </Tag>
    </Card>
  );
}
