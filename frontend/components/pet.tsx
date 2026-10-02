import { useId } from "react";

import type { PetStage } from "@/lib/api";
import { ACCESSORY_ART, type Anchors, type Slot } from "@/components/pet-accessories";
import { cn } from "@/lib/utils";

/**
 * The pet, at whichever of the five stages its owner has reached.
 *
 * Inline SVG rather than image files: it recolours with the theme, scales from
 * a 40px row to a 200px hero without a second asset, and - the reason that
 * decides it - accessories have to be *fitted*. A hat sits lower on a hatchling
 * than on an adult, so each stage publishes its own anchor points and the
 * accessory draws itself against them. Twelve flat PNGs could not do that.
 *
 * The stage names are hatching language (egg, hatched, …), so the pet is a
 * creature rather than the plant the first draft drew. A plant cannot wear a
 * scarf or hold an umbrella, and five of the twelve shop items are exactly
 * that.
 *
 * Motion is idle-only and never conveys information: the pet bobs, blinks, and
 * at legendary its aura turns. Every animation is switched off under
 * `prefers-reduced-motion` by the rules in globals.css.
 */

const STAGE_LABEL: Record<PetStage, string> = {
  egg: "Still in the shell",
  hatched: "Just hatched",
  juvenile: "Growing up",
  adult: "Fully grown",
  legendary: "Legendary",
};

/**
 * Where things attach, per stage. All in the 120x120 viewBox.
 *
 * `headTop` is the crown, `eyeY` the eye line, `eyeDx` half the distance
 * between the eyes, `hand` where a held item goes, and `scale` how big an
 * accessory should be drawn relative to an adult.
 */
const ANCHORS: Record<PetStage, Anchors> = {
  egg: { headTop: 45, eyeY: 68, eyeDx: 7, neckY: 76, bodyW: 23, hand: [86, 80], scale: 0.78, cx: 60 },
  hatched: { headTop: 57, eyeY: 72, eyeDx: 6, neckY: 80, bodyW: 15, hand: [83, 84], scale: 0.72, cx: 60 },
  juvenile: { headTop: 43, eyeY: 62, eyeDx: 8, neckY: 72, bodyW: 22, hand: [89, 76], scale: 0.9, cx: 60 },
  adult: { headTop: 29, eyeY: 52, eyeDx: 9.5, neckY: 63, bodyW: 28, hand: [95, 68], scale: 1.06, cx: 60 },
  legendary: { headTop: 25, eyeY: 49, eyeDx: 10, neckY: 60, bodyW: 30, hand: [97, 65], scale: 1.12, cx: 60 },
};

export function Pet({
  stage,
  equipped = [],
  className,
  animate = true,
}: {
  stage: PetStage;
  /** `image_url` of each worn accessory, straight from the API. */
  equipped?: string[];
  className?: string;
  /** Off for a tiny avatar, where a bobbing 32px blob just looks like a glitch. */
  animate?: boolean;
}) {
  const anchors = ANCHORS[stage];
  // One id per instance: two pets on the same page must not share a clipPath.
  const clipId = useId();
  const worn = equipped
    .map((url) => ACCESSORY_ART[url.split("/").pop()?.replace(/\.svg$/, "") ?? ""])
    .filter((art) => art !== undefined)
    // An egg has no eyes to put glasses on and no hands to hold an umbrella,
    // so those two slots are skipped until it hatches. A hat sits on a shell
    // and a scarf ties around one, and both are on sale at egg stage - an item
    // you can buy must be an item you can see.
    .filter(
      (art) => stage !== "egg" || (art.slot !== "eyewear" && art.slot !== "held_item"),
    );

  // Layer order is the order things sit in front of each other, not the order
  // they were bought: ground, then the pet, then what it wears, then its face.
  const layer = (slot: Slot) => worn.filter((art) => art.slot === slot);
  const backdrop = worn.find((art) => art.slot === "background");
  const holding = worn.some((art) => art.slot === "held_item");

  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Your pet: ${STAGE_LABEL[stage]}`}
      className={cn("size-28 overflow-visible", className)}
    >
      {/* Backgrounds are scenery and paint past the frame on purpose - a
          horizon has to run off the edge rather than stop short. Clipped to a
          disc so it reads as a window, not a leak. */}
      {backdrop && (
        <>
          <defs>
            <clipPath id={`pet-scene-${clipId}`}>
              <circle cx="60" cy="58" r="50" />
            </clipPath>
          </defs>
          <g clipPath={`url(#pet-scene-${clipId})`}>{backdrop.draw(anchors)}</g>
        </>
      )}

      {/* A legendary pet turns inside its own aura. */}
      {stage === "legendary" && (
        <g className={animate ? "pet-aura" : undefined} style={{ transformOrigin: "60px 56px" }}>
          <circle
            cx="60"
            cy="56"
            r="46"
            className="fill-none stroke-eco/35"
            strokeWidth="1.5"
            strokeDasharray="3 7"
          />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <circle
              key={a}
              cx="60"
              cy="10"
              r="2"
              className="fill-eco"
              transform={`rotate(${a} 60 56)`}
            />
          ))}
        </g>
      )}

      {/* Ground, so the pet never floats. A backdrop brings its own. */}
      {!backdrop && <ellipse cx="60" cy="102" rx="28" ry="5" className="fill-foreground/8" />}

      <g
        className={animate ? (stage === "egg" ? "pet-wobble" : "pet-bob") : undefined}
        style={{ transformOrigin: "60px 100px" }}
      >
        <Body stage={stage} />
        {layer("clothing").map((art) => (
          <g key={art.slug}>{art.draw(anchors)}</g>
        ))}
        {stage !== "egg" && <Face stage={stage} animate={animate} />}
        {layer("eyewear").map((art) => (
          <g key={art.slug}>{art.draw(anchors)}</g>
        ))}
        {layer("headwear").map((art) => (
          <g key={art.slug}>{art.draw(anchors)}</g>
        ))}
        {holding && <Arm stage={stage} />}
        {layer("held_item").map((art) => (
          <g key={art.slug}>{art.draw(anchors)}</g>
        ))}
      </g>
    </svg>
  );
}

function Body({ stage }: { stage: PetStage }) {
  if (stage === "egg") {
    return (
      <g>
        <ellipse
          cx="60"
          cy="70"
          rx="24"
          ry="30"
          className="fill-eco-muted stroke-eco"
          strokeWidth="2.5"
        />
        {/* Speckles, so it reads as an egg rather than a pale oval. */}
        <g className="fill-eco/30">
          <ellipse cx="50" cy="76" rx="3" ry="2.4" />
          <ellipse cx="68" cy="84" rx="2.4" ry="2" />
          <ellipse cx="60" cy="92" rx="2" ry="1.6" />
          <ellipse cx="72" cy="70" rx="2" ry="1.6" />
        </g>
        {/* The crack it will come out of, right across the shell. */}
        <path
          d="M37 62l9-5 3 8 8-7 4 9 8-6 4 7"
          className="fill-none stroke-eco"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <ellipse
          cx="50"
          cy="57"
          rx="5"
          ry="7"
          transform="rotate(-20 50 57)"
          className="fill-background/60"
        />
      </g>
    );
  }

  // Everything after hatching is one creature that grows: the same round body,
  // taller and rounder, with its ears opening out.
  // Each stage is visibly bigger than the last - growth has to read from
  // across a dashboard, so the silhouette changes rather than the detail. Every
  // body sits on the same ground line: cy + ry lands at roughly 100.
  const geometry = {
    hatched: { cy: 82, rx: 17, ry: 18, earY: 62, earR: 6, earDx: 10, shell: true },
    juvenile: { cy: 73, rx: 24, ry: 27, earY: 48, earR: 8, earDx: 15, shell: false },
    adult: { cy: 66, rx: 31, ry: 34, earY: 34, earR: 11, earDx: 21, shell: false },
    legendary: { cy: 64, rx: 33, ry: 36, earY: 30, earR: 12, earDx: 23, shell: false },
  }[stage];

  return (
    <g>
      {/* Leaf ears, opening wider as it grows. */}
      {[-1, 1].map((side) => (
        <path
          key={side}
          d={`M60 ${geometry.earY + 10}
              C ${60 + side * geometry.earDx} ${geometry.earY + 8},
                ${60 + side * (geometry.earDx + 4)} ${geometry.earY - 4},
                ${60 + side * (geometry.earDx - 2)} ${geometry.earY - geometry.earR}
              C ${60 + side * 4} ${geometry.earY - 2}, 60 ${geometry.earY + 4}, 60 ${geometry.earY + 10} Z`}
          className="fill-eco-muted stroke-eco"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ))}

      <ellipse
        cx="60"
        cy={geometry.cy}
        rx={geometry.rx}
        ry={geometry.ry}
        className={cn("stroke-eco", stage === "legendary" ? "fill-eco/30" : "fill-eco-muted")}
        strokeWidth="2.5"
      />

      {/* A legendary pet is lit from inside. */}
      {stage === "legendary" && (
        <ellipse
          cx="60"
          cy={geometry.cy}
          rx={geometry.rx + 4}
          ry={geometry.ry + 4}
          className="fill-none stroke-eco/25"
          strokeWidth="3"
        />
      )}

      {/* Belly. Reads as a lighter front rather than a flat disc. */}
      <ellipse
        cx="60"
        cy={geometry.cy + 7}
        rx={geometry.rx * 0.52}
        ry={geometry.ry * 0.42}
        className="fill-background/55"
      />

      {/* Feet. */}
      {[-1, 1].map((side) => (
        <ellipse
          key={side}
          cx={60 + side * (geometry.rx * 0.45)}
          cy={geometry.cy + geometry.ry - 1}
          rx="6"
          ry="3.5"
          className="fill-eco"
        />
      ))}

      {/* The shell it has only just left, still around its base. */}
      {geometry.shell && (
        <path
          d="M38 93a22 22 0 0 0 44 0l-5 4-5-4-6 4-6-4-6 4-5-4z"
          className="fill-eco-muted stroke-eco"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}

/** A stubby arm out to the held item, so nothing floats unattached. */
function Arm({ stage }: { stage: PetStage }) {
  const [hx, hy] = ANCHORS[stage].hand;
  const bodyEdge = { egg: 80, hatched: 74, juvenile: 82, adult: 88, legendary: 91 }[stage];
  const bodyY = { egg: 78, hatched: 84, juvenile: 76, adult: 70, legendary: 68 }[stage];

  return (
    <g>
      <path
        d={`M${bodyEdge - 6} ${bodyY} Q ${(bodyEdge + hx) / 2} ${(bodyY + hy) / 2 + 3} ${hx - 2} ${hy}`}
        className="fill-none stroke-eco"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <circle cx={hx - 2} cy={hy} r="3.2" className="fill-eco" />
    </g>
  );
}

function Face({ stage, animate }: { stage: PetStage; animate: boolean }) {
  const { eyeY, eyeDx } = ANCHORS[stage];

  return (
    <g>
      <g className={animate ? "pet-blink" : undefined}>
        {[-1, 1].map((side) => (
          <ellipse
            key={side}
            cx={60 + side * eyeDx}
            cy={eyeY}
            rx="2.4"
            ry="3"
            className="fill-foreground"
          />
        ))}
      </g>
      {/* A small smile, wider the more grown it is. */}
      <path
        d={`M${60 - eyeDx * 0.6} ${eyeY + 7} q ${eyeDx * 0.6} ${stage === "hatched" ? 3 : 4.5} ${eyeDx * 1.2} 0`}
        className="fill-none stroke-foreground/70"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Cheeks arrive once there is a face big enough to put them on. */}
      {stage !== "hatched" && (
        <>
          <circle cx={60 - eyeDx * 2} cy={eyeY + 4} r="3" className="fill-eco/25" />
          <circle cx={60 + eyeDx * 2} cy={eyeY + 4} r="3" className="fill-eco/25" />
        </>
      )}
    </g>
  );
}

export { STAGE_LABEL, ANCHORS };
