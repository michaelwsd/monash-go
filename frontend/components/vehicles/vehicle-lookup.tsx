import { Search } from "lucide-react";
import Link from "next/link";

import { Button, Callout, Card, GhostPanel, Icon, Input } from "@/components/ui";
import { formatConsumption, formatFuelType } from "@/lib/format";
import type { VehicleReference } from "@/lib/types";

interface VehicleLookupProps {
  query: string;
  results: VehicleReference[];
}

/** Prefills the manual form from a chosen reference row, via the URL. */
function prefillHref(row: VehicleReference, query: string): string {
  const params = new URLSearchParams({
    q: query,
    make: row.make,
    model: row.model,
    year: String(row.year),
    fuel: row.fuelType,
    consumption: String(row.avgConsumption),
  });
  return `/vehicles/new?${params.toString()}#manual`;
}

/**
 * The reference lookup — a convenience that saves typing, never a gate.
 *
 * A GET form, so the query lives in the URL and the results are rendered on the
 * server. Picking a row is a link that writes the values into the URL, which the
 * manual form below reads as its defaults. That is why no client state is shared
 * between the two halves of this screen: the URL is the shared state, so a chosen
 * vehicle survives a reload and can be linked to.
 *
 * The "can't find it" panel is always visible, not revealed after a failed
 * search. Around 12% of the Australian market is simply absent from this table,
 * and those drivers should not have to search twice to learn it.
 */
export function VehicleLookup({ query, results }: VehicleLookupProps) {
  const searched = query.trim().length >= 2;

  return (
    <div className="flex flex-col gap-3">
      <form method="get" action="/vehicles/new" className="flex items-end gap-2">
        <label htmlFor="vehicle-q" className="flex-1">
          <span className="label mb-1 block">Search make &amp; model</span>
          <Input
            id="vehicle-q"
            name="q"
            defaultValue={query}
            placeholder="Toyota Corolla"
            autoComplete="off"
          />
        </label>
        <Button type="submit" variant="secondary" size="lg">
          <Icon as={Search} size={15} />
          Search
        </Button>
      </form>

      {results.length > 0 ? (
        <Card bare className="overflow-hidden">
          <ul className="flex list-none flex-col p-0">
            {results.map((row) => (
              <li key={row.id} className="border-t border-divider first:border-t-0">
                <Link
                  href={prefillHref(row, query)}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs no-underline text-ink transition-colors hover:bg-ink/5"
                >
                  <span className="min-w-0">
                    <span className="font-semibold">
                      {row.make} {row.model} {row.year}
                    </span>
                    <span className="text-ink/60">
                      {" "}
                      · {formatFuelType(row.fuelType)}
                    </span>
                  </span>
                  <span className="label shrink-0">
                    {formatConsumption(row.avgConsumption, row.fuelType)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : searched ? (
        <Callout tone="warning">
          Nothing matching &ldquo;{query}&rdquo;. Fill the details in below — the
          lookup is only there to save typing.
        </Callout>
      ) : null}

      <GhostPanel className="text-xs leading-relaxed">
        Can&rsquo;t find it? The reference data is Canadian, so many Australian
        models — MG, BYD, GWM, LDV, Chery, Haval and most utes — are not in it.
        That is roughly one car in eight. Enter the details by hand instead; the
        numbers work exactly the same.
      </GhostPanel>
    </div>
  );
}
