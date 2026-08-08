"use server";

/**
 * Pet and shop mutations. See `lib/actions/bookings.ts` for the standing rule
 * that each Server Action authenticates its own caller.
 */

/**
 * `POST /pet/accessories/buy` — buys an accessory and deducts green points.
 *
 * The two checks that matter both belong on the server: the user must hold enough
 * points, and their pet must have reached the accessory's `required_stage`. A
 * client-side check only decides whether the button looks available.
 */
export async function buyAccessory(formData: FormData): Promise<void> {
  const accessoryId = formData.get("accessoryId");
  if (typeof accessoryId !== "string" || accessoryId.length === 0) {
    throw new Error("buyAccessory: missing accessoryId");
  }

  // TODO(backend): POST {API}/api/v1/pet/accessories/buy { accessory_id }.
  // The point deduction and the pet_accessories insert must be one transaction,
  // or a double submit charges twice for one hat.
}

/** `PUT /pet/accessories/{id}/equip` — toggles an owned accessory on or off. */
export async function toggleEquip(formData: FormData): Promise<void> {
  const ownedId = formData.get("ownedId");
  if (typeof ownedId !== "string" || ownedId.length === 0) {
    throw new Error("toggleEquip: missing ownedId");
  }

  // TODO(backend): PUT {API}/api/v1/pet/accessories/{ownedId}/equip
}
