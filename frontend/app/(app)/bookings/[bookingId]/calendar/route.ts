import { getBookingConfirmation, getRideDetail } from "@/lib/data/queries";
import { formatCampus } from "@/lib/format";

/** RFC 5545 wants UTC basic format: `20260810T081500Z`. */
function toIcsUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** Long lines must be folded and CRLF is mandatory, so build the file from parts. */
function icsLines(lines: string[]): string {
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * `GET /bookings/{bookingId}/calendar` — the booking as an .ics file.
 *
 * Wireframe 1i puts an "Add to calendar" button on the confirmation. Most of the
 * wireframe's remaining actions need backend endpoints that do not exist yet;
 * this one needs nothing but the booking, so it is built for real rather than
 * shipped as a dead button.
 *
 * A Route Handler rather than a Server Action: the browser needs a URL that
 * responds with a file and a `Content-Disposition`, which an action returning
 * JSON cannot provide. Times are written in UTC to avoid shipping a VTIMEZONE
 * block; every calendar client renders them back in the user's own zone.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;

  const confirmation = await getBookingConfirmation(bookingId);
  if (!confirmation) {
    return new Response("Booking not found", { status: 404 });
  }

  // TODO(backend): verify the Clerk session owns this booking. Until then this
  // handler must not be deployed publicly — it would expose a driver's phone
  // number in the DESCRIPTION field to anyone who guessed a booking id.
  const detail = await getRideDetail(confirmation.ride.id);
  const durationMin = detail?.durationMin ?? 30;

  const start = new Date(confirmation.ride.departureAt);
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const route = `${formatCampus(confirmation.ride.origin)} to ${formatCampus(
    confirmation.ride.destination,
  )}`;

  const body = icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MonashGo//Ride booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:booking-${confirmation.booking.id}@monashgo`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:MonashGo carpool - ${route}`,
    `LOCATION:${confirmation.pickupPoint ?? formatCampus(confirmation.ride.origin)}`,
    `DESCRIPTION:Driver ${confirmation.driver.displayName} (${confirmation.driver.phone}). Arrive five minutes early.`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:MonashGo carpool leaving soon",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]);

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="monashgo-${confirmation.booking.id}.ics"`,
      // A booking's details can change, so never let a proxy hold this.
      "Cache-Control": "no-store",
    },
  });
}
