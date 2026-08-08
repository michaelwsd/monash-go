import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { AccessoryCard } from "@/components/pet/accessory-card";
import { PetAvatar } from "@/components/pet/pet-avatar";
import { Callout, Card, ProgressBar, Tag } from "@/components/ui";
import { getPetState, getRewards } from "@/lib/data/queries";
import {
  formatCo2,
  formatDay,
  formatPetStage,
  formatPoints,
} from "@/lib/format";
import { PET_STAGES, PET_STAGE_THRESHOLDS } from "@/lib/types";

export const metadata: Metadata = {
  title: "Your pet",
};

export default async function PetPage() {
  const [rewards, pet] = await Promise.all([getRewards(), getPetState()]);

  const ownedIds = new Set(pet.owned.map((item) => item.accessory.id));

  const stageIndex = PET_STAGES.indexOf(rewards.stage);
  const stageFloorKg = PET_STAGE_THRESHOLDS[rewards.stage];
  const remainingKg = rewards.nextStageAtKg
    ? Math.max(0, rewards.nextStageAtKg - rewards.totalCo2SavedKg)
    : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader
        title="Your pet"
        subtitle="It grows on the CO₂ your shared rides avoid — nothing else feeds it."
        actions={<Tag tone="sage">{formatPoints(rewards.greenPoints)} points</Tag>}
      />

      <Card elevation="sm" className="gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="size-24 shrink-0 self-center sm:self-auto">
          <PetAvatar stage={rewards.stage} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="m-0 font-display text-xl leading-tight">
            {rewards.petName} · {formatPetStage(rewards.stage)}
          </p>
          <p className="m-0 mt-1 text-xs text-ink/70">
            Stage {stageIndex + 1} of {PET_STAGES.length} ·{" "}
            {formatCo2(rewards.totalCo2SavedKg)} CO₂ avoided so far
          </p>

          {rewards.nextStage && rewards.nextStageAtKg ? (
            <>
              <ProgressBar
                // Measured across the current band, from this stage's threshold
                // to the next, so the bar reflects progress through the stage
                // rather than progress through the whole game.
                value={rewards.totalCo2SavedKg - stageFloorKg}
                max={rewards.nextStageAtKg - stageFloorKg}
                label={`Progress to ${rewards.nextStage}`}
                className="mt-3"
              />
              <p className="m-0 mt-1.5 text-xs text-ink/70">
                {formatCo2(remainingKg)} to {formatPetStage(rewards.nextStage)} (at{" "}
                {rewards.nextStageAtKg} kg) — about{" "}
                {formatPoints(Math.ceil(remainingKg * 100))} more points
              </p>
            </>
          ) : (
            <p className="m-0 mt-3 text-xs text-ink/70">
              Fully grown. Nothing left to unlock, which is the point.
            </p>
          )}
        </div>
      </Card>

      <section>
        <h2 className="text-lg">Shop</h2>
        <ul className="mt-2 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4">
          {pet.catalog.map((accessory) => (
            <AccessoryCard
              key={accessory.id}
              accessory={accessory}
              owned={ownedIds.has(accessory.id)}
              points={rewards.greenPoints}
              stage={rewards.stage}
            />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg">Points ledger</h2>
        <Card bare className="mt-2 overflow-hidden">
          <table className="w-full text-xs">
            <caption className="sr-only">
              Recent green-point movements, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col" className="label px-4 py-2 text-left">
                  What
                </th>
                <th scope="col" className="label px-4 py-2 text-left">
                  When
                </th>
                <th scope="col" className="label px-4 py-2 text-right">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {rewards.ledger.map((entry) => (
                <tr key={entry.id} className="border-t border-divider">
                  <td className="px-4 py-2.5">{entry.label}</td>
                  <td className="px-4 py-2.5 text-ink/60">
                    {formatDay(entry.occurredAt)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                      entry.delta >= 0 ? "text-sage-700" : "text-clay-700"
                    }`}
                  >
                    {entry.delta >= 0 ? "+" : "−"}
                    {formatPoints(Math.abs(entry.delta))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <Callout tone="note">
        Points = kg CO₂ avoided × 100, awarded once when a ride is marked complete.
      </Callout>

      <Callout tone="muted">
        Your points balance and your lifetime CO₂ are different numbers: buying an
        accessory spends points but does not un-avoid emissions, so the two drift
        apart after your first purchase.
      </Callout>
    </div>
  );
}
