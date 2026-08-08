import { Check, Lock } from "lucide-react";

import { Button, Card, Icon, Tag } from "@/components/ui";
import { buyAccessory } from "@/lib/actions/pet";
import { cn } from "@/lib/cn";
import { formatPetStage, formatPoints } from "@/lib/format";
import { PET_STAGES, type Accessory, type PetStage } from "@/lib/types";

interface AccessoryCardProps {
  accessory: Accessory;
  owned: boolean;
  points: number;
  stage: PetStage;
}

/**
 * One item in the shop.
 *
 * Three states, and the wireframe only draws two of them. It dims both locked
 * and unaffordable items identically, which leaves the user unable to tell "save
 * up" from "grow your pet first" — two problems with completely different
 * answers. So each state says which it is:
 *
 *   owned        — a tick, no button
 *   locked       — a padlock naming the stage that unlocks it
 *   unaffordable — the price, and how many points short
 *   available    — a buy button
 */
export function AccessoryCard({ accessory, owned, points, stage }: AccessoryCardProps) {
  const locked =
    PET_STAGES.indexOf(stage) < PET_STAGES.indexOf(accessory.requiredStage);
  const short = accessory.cost - points;
  const affordable = short <= 0;

  return (
    <Card
      as="li"
      className={cn("gap-2 p-3 text-center", locked && "opacity-60")}
    >
      {/* The item art is the one asset genuinely outstanding. A tinted tile with
          the initial is a deliberate stand-in, not a broken image: it is legible,
          it is on palette, and it does not pretend to be finished art. */}
      <div
        aria-hidden
        className="flex h-14 items-center justify-center rounded-lg bg-sand-200 font-display text-lg text-sand-700"
      >
        {accessory.name.slice(0, 1)}
      </div>

      <p className="m-0 text-xs font-semibold">{accessory.name}</p>

      {owned ? (
        <Tag tone="sage" className="justify-center">
          <Icon as={Check} size={12} />
          Owned
        </Tag>
      ) : locked ? (
        <Tag tone="neutral" className="justify-center">
          <Icon as={Lock} size={12} />
          {formatPetStage(accessory.requiredStage)}
        </Tag>
      ) : (
        <form action={buyAccessory}>
          <input type="hidden" name="accessoryId" value={accessory.id} />
          <Button
            type="submit"
            variant={affordable ? "secondary" : "ghost"}
            size="sm"
            fullWidth
            disabled={!affordable}
          >
            {formatPoints(accessory.cost)} pts
          </Button>
          {!affordable ? (
            <p className="m-0 mt-1 text-[10px] text-ink/55">
              {formatPoints(short)} short
            </p>
          ) : null}
        </form>
      )}
    </Card>
  );
}
