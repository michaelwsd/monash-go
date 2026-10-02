"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, Check, Loader2, Lock, Sprout } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Pet, STAGE_LABEL, ANCHORS } from "@/components/pet";
import { ACCESSORY_ART, type Slot } from "@/components/pet-accessories";
import { PetPreview } from "@/components/pet-preview";
import { ErrorState, FormError, Skeleton } from "@/components/status-blocks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ApiError,
  buyAccessory,
  equipAccessory,
  getRewards,
  getShop,
  type AccessoryCategory,
  type RewardsSummary,
  type ShopItem,
} from "@/lib/api";
import { useCurrentUser } from "@/lib/use-current-user";
import { useQuery } from "@/lib/use-query";
import { cn } from "@/lib/utils";

const LABEL =
  "text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase";

const CATEGORY_NAME: Record<AccessoryCategory, string> = {
  headwear: "Headwear",
  eyewear: "Eyewear",
  clothing: "Clothing",
  held_item: "Held",
  background: "Backgrounds",
};

// Shown in this order rather than by price, so one category reads as one row.
const CATEGORY_ORDER: AccessoryCategory[] = [
  "headwear",
  "eyewear",
  "clothing",
  "held_item",
  "background",
];

/**
 * Rewards and the shop - REQ-013's impact dashboard and REQ-006's pet in one
 * place, because they are the same number seen twice: avoided CO2 grows the
 * pet, and the points it earns buy the hats.
 *
 * Two requests, not three. GET /pet/accessories already says what is owned and
 * worn, so the pet can be dressed from the shop response and there is no
 * window where the two disagree.
 */
export default function RewardsPage() {
  const [version, setVersion] = useState(0);
  const rewards = useQuery((token) => getRewards({ token }), [version]);
  const shop = useQuery((token) => getShop({ token }), [version]);
  const { reload: reloadUser } = useCurrentUser();

  const changed = () => {
    setVersion((v) => v + 1);
    // the header badge reads green_points from the user row
    reloadUser();
  };

  const worn = (shop.data ?? [])
    .filter((i) => i.equipped)
    .map((i) => i.image_url);

  return (
    <AppShell title="Rewards">
      {rewards.status === "loading" && !rewards.data && (
        <Skeleton rows={2} lines={3} />
      )}
      {rewards.status === "error" && (
        <ErrorState
          message="Couldn't load your rewards."
          detail={rewards.error}
          onRetry={rewards.reload}
        />
      )}

      {rewards.data && (
        <div className="flex flex-col gap-3.5">
          <Progression summary={rewards.data} worn={worn} />
          <Shop
            items={shop.data}
            points={rewards.data.green_points}
            loading={shop.status === "loading"}
            failed={shop.status === "error"}
            error={shop.error}
            onRetry={shop.reload}
            onChanged={changed}
          />
        </div>
      )}
    </AppShell>
  );
}

function Progression({
  summary,
  worn,
}: {
  summary: RewardsSummary;
  worn: string[];
}) {
  const fresh = summary.completed_trips === 0;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-col items-center gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        {/* The pet gets its own framed patch so it reads as a scene rather
            than clip art floating in the corner of a card. */}
        <div className="flex size-40 shrink-0 items-center justify-center rounded-xl border border-eco-border bg-eco-muted/50 sm:size-44">
          <Pet
            stage={summary.pet_stage}
            equipped={worn}
            className="size-36 sm:size-40"
          />
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className={LABEL}>{STAGE_LABEL[summary.pet_stage]}</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-[-0.025em] capitalize">
            {summary.pet_stage}
          </p>

          {/* REQ-013 asks for a clear zero-state, and it is the screen most
              people see first: a new account has nothing to summarise. */}
          {fresh ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Your pet hatches and grows with every shared trip. Nothing
                completed yet.
              </p>
              <Button size="lg" className="mt-3.5 w-full sm:w-auto" asChild>
                <Link href="/rides">
                  Find a ride
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <dl className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-3 sm:justify-start">
                <Stat
                  value={`${summary.total_co2_saved.toFixed(1)} kg`}
                  label="CO₂ avoided"
                  eco
                />
                <Stat
                  value={summary.green_points.toLocaleString()}
                  label="green points"
                />
                <Stat
                  value={String(summary.completed_trips)}
                  label="trips completed"
                />
              </dl>

              <div className="mt-4">
                <Progress
                  value={summary.stage_progress}
                  className="h-2 [&>*]:bg-eco"
                />
                <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                  {summary.next_stage === null || summary.co2_to_next === null
                    ? "Fully grown. Nothing left to reach."
                    : `${summary.co2_to_next.toFixed(1)} kg more to ${summary.next_stage}`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* The five stages, with the current one marked. It is the clearest
          answer to "what am I working towards". */}
      <StageRail current={summary.pet_stage} />
    </Card>
  );
}

const STAGES = ["egg", "hatched", "juvenile", "adult", "legendary"] as const;
const STAGE_KG: Record<(typeof STAGES)[number], number> = {
  egg: 0,
  hatched: 15,
  juvenile: 60,
  adult: 200,
  legendary: 800,
};

function StageRail({ current }: { current: (typeof STAGES)[number] }) {
  const reached = STAGES.indexOf(current);

  return (
    <ol className="grid grid-cols-5 border-t bg-muted/30">
      {STAGES.map((stage, i) => {
        const done = i <= reached;
        return (
          <li
            key={stage}
            aria-current={stage === current ? "step" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 px-1 py-2.5 text-center",
              i > 0 && "border-l",
              stage === current && "bg-eco-muted/60",
            )}
          >
            <Pet
              stage={stage}
              animate={false}
              className={cn("size-9", !done && "opacity-30 grayscale")}
            />
            <span
              className={cn(
                "truncate text-[10px] font-medium capitalize",
                done ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {stage}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {STAGE_KG[stage]} kg
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Stat({
  value,
  label,
  eco,
}: {
  value: string;
  label: string;
  eco?: boolean;
}) {
  return (
    <div>
      <dd
        className={cn(
          "text-2xl font-semibold tracking-[-0.025em] tabular-nums",
          eco && "text-eco-foreground",
        )}
      >
        {value}
      </dd>
      <dt className={LABEL}>{label}</dt>
    </div>
  );
}

function Shop({
  items,
  points,
  loading,
  failed,
  error: loadError,
  onRetry,
  onChanged,
}: {
  items: ShopItem[] | null;
  points: number;
  loading: boolean;
  failed: boolean;
  error: string | null;
  onRetry: () => void;
  onChanged: () => void;
}) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    id: string,
    action: (token: string | null) => Promise<unknown>,
  ) => {
    setError(null);
    setBusy(id);
    try {
      await action(await getToken());
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status < 500
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    }
    setBusy(null);
  };

  if (failed) {
    // ErrorState is a card already; wrapping it drew a box inside a box
    return <ErrorState message="Couldn't load the shop." detail={loadError} onRetry={onRetry} />;
  }

  if (loading && !items) {
    return (
      <Card className="gap-3.5 p-3.5">
        <p className={LABEL}>Shop</p>
        <Skeleton rows={2} lines={2} />
      </Card>
    );
  }

  // An empty catalogue is a seeding problem, not a user state, so it says so
  // rather than rendering a blank card with a heading - which is exactly what
  // it did before the accessories table had any rows in it.
  if (items && items.length === 0) {
    return (
      <Card className="gap-1 p-3.5">
        <p className={LABEL}>Shop</p>
        <p className="text-sm text-muted-foreground">
          No accessories are available yet. The catalogue has not been loaded.
        </p>
      </Card>
    );
  }

  return (
    <Card className="gap-4 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className={LABEL}>Shop</p>
        <div className="flex items-center gap-2.5">
          <p className="text-xs text-muted-foreground tabular-nums">
            {points.toLocaleString()} points to spend
          </p>
          {/* Shown everywhere, including the deployed build. It is a view of
              the artwork, not a way to equip anything: it holds its own state
              and never calls the API, so it cannot put an unowned item on a
              real pet. */}
          <PetPreview />
        </div>
      </div>

      {error && <FormError>{error}</FormError>}

      {CATEGORY_ORDER.map((category) => {
        const group = (items ?? []).filter(
          (item) => item.category === category,
        );
        if (group.length === 0) return null;
        return (
          <section key={category} className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold">
              {CATEGORY_NAME[category]}
            </h3>
            <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
              {group.map((item) => (
                <li key={item.id}>
                  <ShopCard
                    item={item}
                    affordable={points >= item.cost}
                    busy={busy === item.id}
                    onBuy={() =>
                      void run(item.id, (t) =>
                        buyAccessory(item.id, { token: t }),
                      )
                    }
                    onToggle={() =>
                      void run(item.id, (t) =>
                        equipAccessory(item.id, !item.equipped, { token: t }),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Card>
  );
}

/** The slice of the pet's 120x120 box where each slot's art actually lives. */
const PREVIEW_BOX: Record<Slot, string> = {
  headwear: "33 10 54 36",
  eyewear: "38 36 44 28",
  clothing: "33 58 54 40",
  held_item: "68 36 40 42",
  background: "10 8 100 100",
};

/** The item on its own, drawn from the same art that goes on the pet. */
function AccessoryPreview({ item, dim }: { item: ShopItem; dim: boolean }) {
  const art =
    ACCESSORY_ART[
      item.image_url
        .split("/")
        .pop()
        ?.replace(/\.svg$/, "") ?? ""
    ];

  if (!art) {
    // A row someone added in SQL with no drawing behind it. Better a neutral
    // placeholder than a blank hole.
    return <Sprout className="size-6 text-muted-foreground" aria-hidden />;
  }

  return (
    <svg
      viewBox={PREVIEW_BOX[art.slot]}
      aria-hidden
      className={cn(
        "size-full transition-[filter,opacity]",
        dim && "opacity-40 grayscale",
      )}
    >
      {art.draw(ANCHORS.adult)}
    </svg>
  );
}

function ShopCard({
  item,
  affordable,
  busy,
  onBuy,
  onToggle,
}: {
  item: ShopItem;
  affordable: boolean;
  busy: boolean;
  onBuy: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-lg border p-2.5 transition-colors",
        item.equipped
          ? "border-eco-border bg-eco-muted/40"
          : "border-border bg-background",
      )}
    >
      <div
        className={cn(
          "relative flex h-16 items-center justify-center overflow-hidden rounded-md",
          item.locked ? "bg-muted/60" : "bg-muted/40",
        )}
      >
        <AccessoryPreview item={item} dim={item.locked} />
        {item.locked && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Lock className="size-4 text-muted-foreground" aria-hidden />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{item.name}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
          {item.locked ? (
            <>
              {/* capitalize on the whole line gave "Hatched Unlocks This":
                  the CSS capitalises every word, and only the stage is one. */}
              <span className="capitalize">{item.required_stage}</span> unlocks
              this
            </>
          ) : item.owned ? (
            (item.description ?? "Owned")
          ) : (
            (item.description ?? "")
          )}
        </p>
      </div>

      {item.owned ? (
        <Button
          variant={item.equipped ? "secondary" : "outline"}
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={onToggle}
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : item.equipped ? (
            <Check aria-hidden />
          ) : null}
          {item.equipped ? "Worn" : "Wear"}
        </Button>
      ) : (
        <Button
          size="sm"
          variant={affordable && !item.locked ? "default" : "outline"}
          className="w-full tabular-nums"
          disabled={busy || item.locked || !affordable}
          onClick={onBuy}
        >
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {item.locked ? "Locked" : `${item.cost.toLocaleString()} pts`}
        </Button>
      )}
    </div>
  );
}
