import Link from "next/link";

import { Card, CardKicker, ProgressBar } from "@/components/ui";
import { formatCo2, formatPoints } from "@/lib/format";
import { ROUTES } from "@/components/layout/routes";
import type { RewardsSummary } from "@/lib/types";

/**
 * The rewards teaser.
 *
 * The wireframes state the gap in points ("260 to next pet stage") while the pet
 * page states it in kilograms ("2.6 kg to stage 3"). Both are shown here, in
 * that order, because they are the same distance in two units and points are
 * what the reader is looking at on this card. `points = kg x 100`, so they can
 * never disagree.
 */
export function RewardsProgressCard({ rewards }: { rewards: RewardsSummary }) {
  const { totalCo2SavedKg, nextStage, nextStageAtKg } = rewards;
  const remainingKg = nextStageAtKg ? Math.max(0, nextStageAtKg - totalCo2SavedKg) : 0;

  return (
    <Card elevation="sm" className="gap-2 p-4">
      <CardKicker>Rewards</CardKicker>

      <p className="font-display text-lg leading-none">
        {formatPoints(rewards.greenPoints)} pts
      </p>

      {nextStage && nextStageAtKg ? (
        <>
          <ProgressBar
            // Measured across the current stage's band, not from zero: a bar
            // that creeps from 0/800 makes every stage after the first look
            // unreachable.
            value={totalCo2SavedKg}
            max={nextStageAtKg}
            label={`Progress to ${nextStage}`}
            className="mt-1"
          />
          <p className="text-xs text-ink/70">
            {formatPoints(Math.ceil(remainingKg * 100))} pts to go ·{" "}
            {formatCo2(remainingKg)} CO₂ until your pet {nextStage === "hatched" ? "hatches" : `becomes ${nextStage}`}
          </p>
        </>
      ) : (
        <p className="text-xs text-ink/70">Legendary. There is no next stage.</p>
      )}

      <Link href={ROUTES.pet.href} className="mt-1 text-xs font-semibold text-clay-700">
        Open your pet →
      </Link>
    </Card>
  );
}
