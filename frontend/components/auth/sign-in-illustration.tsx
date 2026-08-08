/**
 * The hero mark on the sign-in screen.
 *
 * The wireframe leaves a grey "illustration placeholder" here. A shipped
 * product cannot, and a stock photo would fight the palette, so this is drawn
 * from the system's own vocabulary: soft circular shapes, a dashed route
 * between two campus nodes, and the two accents doing the work.
 *
 * Inline SVG rather than a file, for three reasons — it costs no request, it
 * takes its colours from Tailwind's `fill-*`/`stroke-*` utilities so it moves
 * with the theme instead of freezing today's hexes into an asset, and it stays
 * crisp at any size.
 */
export function SignInIllustration() {
  return (
    <svg
      viewBox="0 0 320 150"
      role="img"
      aria-label="Two campuses joined by a shared route"
      className="h-auto w-full"
    >
      {/* Soft ground shapes. Deliberately overlapping and off-centre — the
          system asks for asymmetry rather than a centred composition. */}
      <circle cx="70" cy="98" r="46" className="fill-sage-200" />
      <circle cx="243" cy="56" r="54" className="fill-clay-200" />
      <circle cx="176" cy="112" r="26" className="fill-sand-200" />

      {/* The route. Dashed because it is a planned path, not live tracking —
          the same promise the profile screen makes in words. */}
      <path
        d="M70 98 C 122 98, 150 56, 243 56"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1 11"
        className="stroke-clay-700"
      />

      {/* Riders picked up along the way. */}
      <circle cx="126" cy="88" r="6" className="fill-sand-100" />
      <circle cx="126" cy="88" r="3" className="fill-sage-700" />
      <circle cx="168" cy="70" r="6" className="fill-sand-100" />
      <circle cx="168" cy="70" r="3" className="fill-sage-700" />

      {/* The two campus nodes. */}
      <circle cx="70" cy="98" r="13" className="fill-sand-100" />
      <circle cx="70" cy="98" r="7" className="fill-sage-700" />
      <circle cx="243" cy="56" r="13" className="fill-sand-100" />
      <circle cx="243" cy="56" r="7" className="fill-clay-700" />
    </svg>
  );
}
