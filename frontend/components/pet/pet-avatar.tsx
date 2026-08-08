import { cn } from "@/lib/cn";
import type { PetStage } from "@/lib/types";

/**
 * The pet, drawn per stage.
 *
 * The wireframe reserves a circle labelled "Pet art placeholder". A reward that
 * looks like a missing image is not a reward, and the whole mechanic rests on the
 * user wanting to see the next form — so the five stages are drawn here rather
 * than deferred to an asset pipeline.
 *
 * Inline SVG on theme utilities (`fill-sage-600` and friends) rather than five
 * PNGs: it costs no requests, scales to any size, and follows the palette instead
 * of freezing today's hexes into a bitmap. Each stage adds to the one before it,
 * so progression reads as growth rather than replacement.
 */
export function PetAvatar({
  stage,
  className,
}: {
  stage: PetStage;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Your pet at the ${stage} stage`}
      className={cn("size-full", className)}
    >
      {/* The ground everything sits on. Sage rather than sand: it has to differ
          from BOTH the card surface behind it and the near-white shell in front
          of it, and the sand ramp cannot do both at once — a sand disc either
          dissolves into the card or swallows the egg. */}
      <circle cx="50" cy="50" r="48" className="fill-sage-200" />

      {stage === "legendary" ? (
        <>
          <circle cx="50" cy="50" r="42" className="fill-clay-200" />
          <circle cx="50" cy="50" r="34" className="fill-sage-200" />
        </>
      ) : null}

      {stage === "egg" ? (
        <>
          <ellipse cx="50" cy="54" rx="24" ry="30" className="fill-sand-100" />
          <circle cx="42" cy="44" r="3.5" className="fill-sage-300" />
          <circle cx="57" cy="52" r="2.5" className="fill-sage-300" />
          <circle cx="47" cy="64" r="3" className="fill-clay-300" />
        </>
      ) : (
        <>
          {/* The cracked shell stays under every later stage — the pet grew out
              of it, it did not swap for something else. */}
          <path
            d="M28 72 Q50 88 72 72 L72 66 Q50 78 28 66 Z"
            className="fill-sand-100"
          />

          {/* Stem. */}
          <rect
            x="47"
            y={stage === "hatched" ? "48" : "34"}
            width="6"
            height={stage === "hatched" ? "26" : "40"}
            rx="3"
            className="fill-sage-700"
          />

          {/* First pair of leaves, on every stage past the egg. */}
          <ellipse
            cx="34"
            cy="54"
            rx="14"
            ry="8"
            className="fill-sage-500"
            transform="rotate(-18 34 54)"
          />
          <ellipse
            cx="66"
            cy="54"
            rx="14"
            ry="8"
            className="fill-sage-500"
            transform="rotate(18 66 54)"
          />

          {stage !== "hatched" ? (
            <>
              {/* Second pair, higher up. */}
              <ellipse
                cx="36"
                cy="38"
                rx="12"
                ry="7"
                className="fill-sage-600"
                transform="rotate(-24 36 38)"
              />
              <ellipse
                cx="64"
                cy="38"
                rx="12"
                ry="7"
                className="fill-sage-600"
                transform="rotate(24 64 38)"
              />
            </>
          ) : null}

          {stage === "adult" || stage === "legendary" ? (
            /* A canopy: the sprout has become a tree. */
            <>
              <circle cx="50" cy="28" r="15" className="fill-sage-600" />
              <circle cx="38" cy="32" r="9" className="fill-sage-500" />
              <circle cx="62" cy="32" r="9" className="fill-sage-500" />
            </>
          ) : (
            /* A bud, waiting. */
            <circle cx="50" cy="32" r="7" className="fill-clay-400" />
          )}

          {stage === "legendary" ? (
            <>
              <circle cx="24" cy="24" r="4" className="fill-clay" />
              <circle cx="76" cy="22" r="3" className="fill-clay" />
              <circle cx="82" cy="46" r="2.5" className="fill-clay-400" />
              <circle cx="18" cy="46" r="2.5" className="fill-clay-400" />
            </>
          ) : null}

          {/* Eyes, so it reads as a creature rather than a houseplant. */}
          <circle cx="45" cy="60" r="2" className="fill-ink" />
          <circle cx="55" cy="60" r="2" className="fill-ink" />
        </>
      )}
    </svg>
  );
}
