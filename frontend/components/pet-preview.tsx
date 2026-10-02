"use client";

import { useState } from "react";
import { Eye, RotateCcw } from "lucide-react";

import { Pet, STAGE_LABEL } from "@/components/pet";
import { ACCESSORY_ART, type Slot } from "@/components/pet-accessories";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PetStage } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * A harness for looking at the pet art without earning it.
 *
 * Every combination is five stages times twelve items, which is not something
 * anyone can reach by riding, so the only way to see whether a hat sits right
 * on a hatchling is to put it there directly. It reads from ACCESSORY_ART
 * rather than from the API on purpose: the point is to check the drawings, and
 * an unseeded database or an empty inventory would leave nothing to look at.
 *
 * Development only - `RewardsPage` does not render the trigger in a production
 * build, so this never ships to a student. It is a drawing board, not a
 * try-before-you-buy: showing real users items they do not own would make the
 * shop's owned/locked distinction meaningless.
 */

const STAGES: PetStage[] = ["egg", "hatched", "juvenile", "adult", "legendary"];

const SLOT_NAME: Record<Slot, string> = {
  headwear: "Headwear",
  eyewear: "Eyewear",
  clothing: "Clothing",
  held_item: "Held",
  background: "Background",
};

const SLOT_ORDER: Slot[] = [
  "headwear",
  "eyewear",
  "clothing",
  "held_item",
  "background",
];

const ALL = Object.values(ACCESSORY_ART);

export function PetPreview() {
  const [stage, setStage] = useState<PetStage>("adult");
  const [worn, setWorn] = useState<string[]>([]);
  const [animate, setAnimate] = useState(true);

  const toggle = (slug: string) =>
    setWorn((current) =>
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug],
    );

  // The component takes image_url values, which is what the API hands it, so
  // the harness exercises the same lookup the real page does rather than a
  // shortcut around it.
  const equipped = worn.map((slug) => `/pet/${slug}.svg`);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Eye aria-hidden />
          Preview art
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pet preview</DialogTitle>
          <DialogDescription>
            Every stage and accessory, without having to earn them. Development
            only.
          </DialogDescription>
        </DialogHeader>

        {/* Two columns from sm up: the pet and its stages on the left, the
            toggles on the right. Stacked in one column the content was taller
            than the dialog, so the pet had to be sticky and the first toggle
            row sat half-hidden under it. Side by side nothing scrolls at all.
            It still stacks on a phone, where the pet stays stuck to the top. */}
        <DialogBody className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-start sm:gap-5 sm:pt-4 sm:pb-4">
          {/* Sticky, because the accessory buttons are far enough down that
              the pet would scroll off exactly when you are changing it. A
              preview you cannot see while toggling is not a preview. The
              top padding is the body's, so the pet does not touch the header
              when it sticks. */}
          <div className="sticky top-0 z-10 -mx-4 border-b bg-card px-4 pt-4 pb-3 sm:static sm:mx-0 sm:w-[46%] sm:shrink-0 sm:border-0 sm:p-0">
            <div className="flex items-center justify-center gap-4 rounded-xl border border-eco-border bg-eco-muted/50 px-4 py-3">
              <Pet
                stage={stage}
                equipped={equipped}
                animate={animate}
                className="size-28"
              />
              <p className="text-xs text-muted-foreground">
                {STAGE_LABEL[stage]}
              </p>
            </div>

            {/* Kept inside the sticky block with the pet. The five thumbnails
                are the same question the hero asks, answered for every body,
                and they are how you change stage - both have to stay put while
                you toggle accessories further down. */}
            <ol className="mt-2.5 grid grid-cols-5 gap-1.5">
              {STAGES.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setStage(s)}
                    aria-pressed={s === stage}
                    className={cn(
                      "flex w-full flex-col items-center gap-0.5 rounded-lg border p-1.5 transition-colors",
                      s === stage
                        ? "border-eco-border bg-eco-muted"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <Pet
                      stage={s}
                      equipped={equipped}
                      animate={false}
                      className="size-11"
                    />
                    <span className="truncate text-[10px] font-medium capitalize">
                      {s}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-1 flex-col gap-4">
            {SLOT_ORDER.map((slot) => (
              <div key={slot}>
                <Label>{SLOT_NAME[slot]}</Label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ALL.filter((art) => art.slot === slot).map((art) => (
                    <Button
                      key={art.slug}
                      type="button"
                      size="sm"
                      variant={
                        worn.includes(art.slug) ? "secondary" : "outline"
                      }
                      aria-pressed={worn.includes(art.slug)}
                      onClick={() => toggle(art.slug)}
                    >
                      {art.slug}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogBody>

        {/* In the footer, not at the end of the body: DialogBody carries no
            vertical padding by design, so a last child there sits flush
            against the dialog's edge. The footer also does not scroll, which
            is what you want for the two controls reached most often. */}
        <DialogFooter className="flex-row items-center justify-between border-t sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWorn([])}
              disabled={!worn.length}
            >
              <RotateCcw aria-hidden />
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-pressed={!animate}
              onClick={() => setAnimate((a) => !a)}
            >
              {animate ? "Stop motion" : "Start motion"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {worn.length} worn
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}
