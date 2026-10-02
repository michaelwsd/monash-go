import type { ReactNode } from "react";

/**
 * The twelve shop items, drawn onto the pet.
 *
 * Each one is a function of the stage's anchors rather than a fixed drawing,
 * because the same hat has to sit on a hatchling's small head and an adult's
 * large one. The anchors come from `pet.tsx`; an accessory never hardcodes a y
 * coordinate it could derive.
 *
 * Keyed by the basename of `accessories.image_url`, so the database row and the
 * drawing are tied by one stable string. A slug with no entry here simply does
 * not render - the pet is never broken by a row someone added in SQL.
 */

export interface Anchors {
  /** Top of the head: where a hat's brim rests. */
  headTop: number;
  /** The eye line. */
  eyeY: number;
  /** Half the distance between the eyes. */
  eyeDx: number;
  /** Where clothing sits, and half the body's width there. A face measure
   *  cannot size a scarf: an egg's eyes are close together and its body is
   *  wide, so eyeDx produced a tie rather than a scarf. */
  neckY: number;
  bodyW: number;
  /** Where a held item goes, [x, y]. */
  hand: [number, number];
  /** Size relative to an adult, so a hatchling's hat is not comically large. */
  scale: number;
  /** Horizontal centre. */
  cx: number;
  slot?: never;
}

export type Slot = "background" | "clothing" | "eyewear" | "headwear" | "held_item";

export interface AccessoryArt {
  slug: string;
  slot: Slot;
  draw: (a: Anchors) => ReactNode;
}

/** Scale a shape about the pet's centre and a given y, so one drawing fits five bodies. */
function fit(a: Anchors, y: number, children: ReactNode): ReactNode {
  return (
    <g transform={`translate(${a.cx} ${y}) scale(${a.scale}) translate(${-a.cx} ${-y})`}>
      {children}
    </g>
  );
}

const ART: AccessoryArt[] = [
  // ---- headwear ---------------------------------------------------------
  {
    slug: "leaf-cap",
    slot: "headwear",
    draw: (a) =>
      fit(
        a,
        a.headTop,
        <g>
          <path
            d={`M${a.cx - 15} ${a.headTop + 2} a15 11 0 0 1 30 0 z`}
            className="fill-eco stroke-eco"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d={`M${a.cx - 15} ${a.headTop + 2} h30`}
            className="stroke-eco-foreground"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d={`M${a.cx} ${a.headTop - 9} q 4 -6 9 -5 q -1 6 -8 7 z`}
            className="fill-eco-muted stroke-eco-foreground"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>,
      ),
  },
  {
    slug: "beanie",
    slot: "headwear",
    draw: (a) =>
      fit(
        a,
        a.headTop,
        <g>
          <path
            d={`M${a.cx - 16} ${a.headTop + 3} a16 14 0 0 1 32 0 z`}
            className="fill-[#b45309] stroke-[#92400e]"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <rect
            x={a.cx - 17}
            y={a.headTop + 1}
            width="34"
            height="6"
            rx="3"
            className="fill-[#d97706] stroke-[#92400e]"
            strokeWidth="1.5"
          />
          <circle cx={a.cx} cy={a.headTop - 13} r="4.5" className="fill-[#fbbf24]" />
        </g>,
      ),
  },
  {
    slug: "grad-cap",
    slot: "headwear",
    draw: (a) =>
      fit(
        a,
        a.headTop,
        <g>
          <path
            d={`M${a.cx - 10} ${a.headTop + 2} h20 v-7 h-20 z`}
            className="fill-[#1f2937]"
          />
          <path
            d={`M${a.cx} ${a.headTop - 14} l20 7 -20 7 -20 -7 z`}
            className="fill-[#111827] stroke-[#374151]"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d={`M${a.cx + 17} ${a.headTop - 6} v9`}
            className="stroke-[#fbbf24]"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx={a.cx + 17} cy={a.headTop + 4} r="2.4" className="fill-[#fbbf24]" />
        </g>,
      ),
  },
  {
    slug: "solar-halo",
    slot: "headwear",
    draw: (a) =>
      fit(
        a,
        a.headTop,
        <g className="pet-halo" style={{ transformOrigin: `${a.cx}px ${a.headTop - 10}px` }}>
          <ellipse
            cx={a.cx}
            cy={a.headTop - 10}
            rx="19"
            ry="6"
            className="fill-none stroke-[#fbbf24]"
            strokeWidth="3"
          />
          {[-14, -7, 0, 7, 14].map((dx) => (
            <circle
              key={dx}
              cx={a.cx + dx}
              cy={a.headTop - 10 - (1 - Math.abs(dx) / 16) * 2}
              r="1.6"
              className="fill-[#fde68a]"
            />
          ))}
        </g>,
      ),
  },

  // ---- eyewear ----------------------------------------------------------
  {
    slug: "round-glasses",
    slot: "eyewear",
    draw: (a) => (
      <g>
        {[-1, 1].map((side) => (
          <circle
            key={side}
            cx={a.cx + side * a.eyeDx}
            cy={a.eyeY}
            r="6"
            className="fill-background/35 stroke-foreground/80"
            strokeWidth="1.8"
          />
        ))}
        <path
          d={`M${a.cx - a.eyeDx + 6} ${a.eyeY} h${a.eyeDx * 2 - 12}`}
          className="stroke-foreground/80"
          strokeWidth="1.8"
        />
      </g>
    ),
  },
  {
    slug: "sunglasses",
    slot: "eyewear",
    draw: (a) => (
      <g>
        {[-1, 1].map((side) => (
          <rect
            key={side}
            x={a.cx + side * a.eyeDx - 7}
            y={a.eyeY - 5}
            width="14"
            height="10"
            rx="4"
            className="fill-[#18181b] stroke-[#3f3f46]"
            strokeWidth="1.5"
          />
        ))}
        <path
          d={`M${a.cx - a.eyeDx + 7} ${a.eyeY - 1} h${a.eyeDx * 2 - 14}`}
          className="stroke-[#3f3f46]"
          strokeWidth="2"
        />
      </g>
    ),
  },

  // ---- clothing ---------------------------------------------------------
  {
    slug: "scarf",
    slot: "clothing",
    draw: (a) => {
      const y = a.neckY;
      const w = a.bodyW * 0.78;
      return (
        <g>
          <path
            d={`M${a.cx - w} ${y} q ${w} 8 ${w * 2} 0 l 0 6 q ${-w} 8 ${-w * 2} 0 z`}
            className="fill-[#dc2626] stroke-[#991b1b]"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d={`M${a.cx + w * 0.45} ${y + 6} l 7 13 -7 2.5 -5 -13 z`}
            className="fill-[#ef4444] stroke-[#991b1b]"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
      );
    },
  },
  {
    slug: "hi-vis",
    slot: "clothing",
    draw: (a) => {
      const y = a.neckY;
      const w = a.bodyW * 0.9;
      const h = a.bodyW * 1.15;
      const gap = 6;
      return (
        <g>
          {/* Two panels with a real gap down the middle, so it reads as an
              open vest over the belly rather than a yellow block. */}
          {[-1, 1].map((side) => (
            <g key={side}>
              <path
                d={`M${a.cx + side * gap} ${y}
                    L${a.cx + side * w} ${y + 3}
                    Q${a.cx + side * (w + 1)} ${y + h / 2} ${a.cx + side * (w - 4)} ${y + h}
                    L${a.cx + side * gap} ${y + h - 2} Z`}
                className="fill-[#facc15] stroke-[#ca8a04]"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d={`M${a.cx + side * (gap + 1)} ${y + h * 0.55} L${a.cx + side * (w - 1.5)} ${y + h * 0.55}`}
                className="stroke-background/90"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
            </g>
          ))}
        </g>
      );
    },
  },

  // ---- held items -------------------------------------------------------
  {
    slug: "umbrella",
    slot: "held_item",
    draw: (a) => {
      const [x, y] = a.hand;
      return (
        <g>
          <path
            d={`M${x} ${y - 26} v 24 a 4 4 0 0 0 8 0`}
            className="fill-none stroke-[#78716c]"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d={`M${x - 15} ${y - 26} a 15 13 0 0 1 30 0 q -7 -4 -15 0 q -8 -4 -15 0 z`}
            className="fill-[#2563eb] stroke-[#1e40af]"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
      );
    },
  },
  {
    slug: "coffee",
    slot: "held_item",
    draw: (a) => {
      const [x, y] = a.hand;
      return (
        <g>
          <path
            d={`M${x - 7} ${y - 12} h14 l-2 15 h-10 z`}
            className="fill-[#f5f5f4] stroke-[#78716c]"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <rect
            x={x - 8}
            y={y - 15}
            width="16"
            height="4"
            rx="1.5"
            className="fill-[#16a34a] stroke-[#15803d]"
            strokeWidth="1.2"
          />
          <path
            d={`M${x - 6} ${y - 4} h11`}
            className="stroke-[#a8a29e]"
            strokeWidth="1.4"
          />
          <path
            d={`M${x - 2} ${y - 22} q 3 -4 0 -7`}
            className="fill-none stroke-foreground/25"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      );
    },
  },

  // ---- backgrounds ------------------------------------------------------
  // Drawn behind everything, so they are absolute rather than anchored.
  {
    slug: "campus-green",
    slot: "background",
    // Painted over the full 120x120 box; `pet.tsx` clips it to a disc, so the
    // horizon runs off the edge instead of stopping short of it.
    draw: () => (
      <g>
        <rect x="0" y="0" width="120" height="120" className="fill-[#dcfce7]" />
        <rect x="0" y="86" width="120" height="34" className="fill-[#86efac]" />
        <path d="M0 86q30 -7 60 0t60 0v8H0z" className="fill-[#86efac]" />
        <g className="fill-[#4ade80]">
          <circle cx="24" cy="62" r="11" />
          <circle cx="99" cy="56" r="8" />
        </g>
        <g className="stroke-[#15803d]" strokeWidth="2.5" strokeLinecap="round">
          <path d="M24 66v22" />
          <path d="M99 60v27" />
        </g>
      </g>
    ),
  },
  {
    slug: "skyline",
    slot: "background",
    draw: () => (
      <g>
        <rect x="0" y="0" width="120" height="120" className="fill-[#1e1b4b]" />
        <circle cx="96" cy="24" r="7" className="fill-[#fcd34d]" />
        {/* Behind the pet, so the towers read as distance rather than fence. */}
        <g className="fill-[#312e81]">
          <rect x="2" y="56" width="14" height="42" />
          <rect x="18" y="42" width="12" height="56" />
          <rect x="32" y="62" width="15" height="36" />
          <rect x="74" y="52" width="16" height="46" />
          <rect x="92" y="60" width="13" height="38" />
          <rect x="107" y="48" width="13" height="50" />
        </g>
        <g className="fill-[#fcd34d]/70">
          {[
            [21, 48], [25, 56], [21, 64], [35, 68], [40, 76],
            [78, 58], [83, 66], [78, 74], [95, 66], [110, 54], [114, 62],
          ].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="2.5" height="3.5" />
          ))}
        </g>
        <rect x="0" y="94" width="120" height="26" className="fill-[#4338ca]/70" />
      </g>
    ),
  },
];

export const ACCESSORY_ART: Record<string, AccessoryArt> = Object.fromEntries(
  ART.map((art) => [art.slug, art]),
);
