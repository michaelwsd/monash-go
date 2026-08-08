"use server";

/**
 * Profile mutations. See `lib/actions/bookings.ts` for the standing rule that
 * each Server Action authenticates its own caller.
 */

/**
 * Saves the settings on the profile screen.
 *
 * Only `is_concession` maps to an existing column. `home_campus` and
 * `ride_reminders` are wireframe fields with nowhere to go yet — see the gap
 * list — and are accepted here so the form is complete rather than half-wired.
 *
 * `is_concession` is not cosmetic: it selects the myki fare in every comparison
 * ($2.85 against $5.70), so changing it changes the transport column on every
 * ride page. That is why the form states what the setting does.
 */
export async function updateProfile(formData: FormData): Promise<void> {
  const isConcession = formData.get("isConcession") === "on";

  // TODO(backend): PATCH the user row. `POST /users/sync` currently seeds
  // is_concession from the email domain on first sign-in and has no update path,
  // so this needs either a new endpoint or an update branch in sync.
  void isConcession;
}
