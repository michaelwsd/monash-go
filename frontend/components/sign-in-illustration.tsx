/**
 * Fills the illustration slot on artboard 1e of the sign-in wireframe.
 *
 * A shared drive between two campuses: one road, two pins, one car. Drawn on
 * the app's own tokens (zinc ground, emerald accent) so it re-colours itself in
 * dark mode instead of being a fixed-colour image.
 *
 * The road is stroked twice over the same path - once thick for the tarmac,
 * once thin and dashed for the centre line - so the two can never drift apart.
 */
/* Runs off both edges so the journey reads as continuing past the frame. */
const ROAD = "M-6 92C70 92 92 58 176 58C260 58 282 92 358 92";

export function SignInIllustration() {
  return (
    <svg
      viewBox="0 0 352 110"
      /* `meet`, not `slice`: the pins live at the far left and right, so
         cropping to fill would cut them off as the card narrows on a phone.
         The container carries the 352:110 aspect ratio, so this scales down
         whole instead of losing its ends. */
      preserveAspectRatio="xMidYMid meet"
      className="size-full"
      role="img"
      aria-label="Two campuses joined by a road, with a shared car between them"
    >
      {/* Low sun, and the far hills the road sits in front of. */}
      {/* Tucked into the corner and cropped by the frame. A free-floating disc
          this size reads as one more tree canopy; a cropped one reads as sky. */}
      <circle cx="332" cy="8" r="30" className="fill-eco/10" />
      <path
        d="M0 78C46 62 88 74 130 70C186 65 232 52 286 60C316 64 334 72 352 70V110H0Z"
        className="fill-muted"
      />

      {/* Two copses either side of centre. The middle is left clear for the car;
          a tree there reads as a smudge behind it. Radius and opacity vary
          together to give depth without adding another colour, and the two
          sides are deliberately not mirrored so it doesn't look stamped.

          Each trunk runs past the road's top edge at its own x, so the road
          crops the base. Stopping short leaves the trees floating like
          lollipops. */}
      <g className="fill-muted-foreground/35">
        <rect x="78.8" y="54" width="2.5" height="16" rx="1.25" />
        <rect x="102.8" y="46" width="2.5" height="17" rx="1.25" />
        <rect x="126.8" y="50" width="2.5" height="7" rx="1.25" />
        <rect x="218.8" y="50" width="2.5" height="7" rx="1.25" />
        <rect x="244.8" y="46" width="2.5" height="17" rx="1.25" />
        <rect x="270.8" y="53" width="2.5" height="17" rx="1.25" />
      </g>
      <g className="fill-eco">
        <circle cx="80" cy="48" r="8" opacity="0.55" />
        <circle cx="104" cy="38" r="11" opacity="0.8" />
        <circle cx="128" cy="45" r="6.5" opacity="0.4" />
        <circle cx="220" cy="45" r="7" opacity="0.4" />
        <circle cx="246" cy="39" r="10" opacity="0.8" />
        <circle cx="272" cy="47" r="8.5" opacity="0.55" />
      </g>

      <path
        d={ROAD}
        fill="none"
        strokeWidth="15"
        strokeLinecap="round"
        className="stroke-border"
      />
      <path
        d={ROAD}
        fill="none"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="9 9"
        className="stroke-card"
      />

      {/* The car, riding the flat crest of the road at the midpoint. */}
      <g>
        <rect
          x="162"
          y="44"
          width="29"
          height="10"
          rx="3.5"
          className="fill-foreground"
        />
        <path
          d="M168 44.5C169.5 39.5 171 38 176.5 38C182 38 183.5 39.5 185 44.5Z"
          className="fill-foreground"
        />
        <path
          d="M170 43.5C171 40.5 172 39.8 176.5 39.8C181 39.8 182 40.5 183 43.5Z"
          className="fill-card"
        />
        <circle cx="169" cy="54" r="3.2" className="fill-foreground" />
        <circle cx="184" cy="54" r="3.2" className="fill-foreground" />
        <circle cx="169" cy="54" r="1.2" className="fill-card" />
        <circle cx="184" cy="54" r="1.2" className="fill-card" />
      </g>

      {/* A campus pin at each end of the road, sized under the car so the car
          stays the subject rather than the markers. */}
      <g className="fill-foreground">
        <path d="M30 66C35.5 66 40 70.4 40 75.7C40 81.9 33.8 87.7 30 91C26.2 87.7 20 81.9 20 75.7C20 70.4 24.5 66 30 66Z" />
        <path d="M322 66C327.5 66 332 70.4 332 75.7C332 81.9 325.8 87.7 322 91C318.2 87.7 312 81.9 312 75.7C312 70.4 316.5 66 322 66Z" />
      </g>
      <g className="fill-card">
        <circle cx="30" cy="76" r="3.8" />
        <circle cx="322" cy="76" r="3.8" />
      </g>
    </svg>
  );
}
