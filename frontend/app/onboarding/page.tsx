"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";

import OnboardingForm, {
  type OnboardingProfile,
} from "@/components/sign-up-form";
import { ApiError, createVehicle, syncUser, updateProfile } from "@/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isLoaded) return null;

  if (!isSignedIn || !user) {
    router.replace("/sign-in");
    return null;
  }

  /**
   * Writes the profile to our database, in a deliberate order.
   *
   * 1. sync, so the users row exists. It is idempotent, and this page can be
   *    reached directly without passing the dashboard's gate, so it cannot
   *    assume someone else has already called it.
   * 2. the vehicle, if they drive. A failed car registration has to leave the
   *    profile incomplete, so the gate sends them back here rather than
   *    stranding a driver whose car was never written.
   * 3. home_campus last, because that is the field the gate reads as "done".
   *    Nothing after this point may fail.
   */
  const saveProfile = async (profile: OnboardingProfile) => {
    setError(null);
    setSaving(true);

    try {
      await syncUser({ token: await getToken() });

      if (profile.mode === "Drive" && profile.car) {
        const car = profile.car;
        await createVehicle(
          {
            make: car.make.trim(),
            model: car.model.trim(),
            year: Number(car.year),
            // "" is unreachable here: isCarUsable gates the Finish button on a
            // fuel type being set, and the form will not submit without it.
            fuel_type: car.fuelType || "petrol",
            fuel_consumption: Number(car.fuelConsumption),
            reference_id: car.referenceId,
          },
          { token: await getToken() },
        );
      }

      await updateProfile(
        {
          phone: profile.phone.replace(/\s/g, ""),
          is_concession: profile.isConcession,
          home_campus: profile.campuses[0],
        },
        { token: await getToken() },
      );

      router.replace("/");
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status < 500
          ? caught.message
          : "We couldn't save your profile. Please try again.",
      );
      setSaving(false);
    }
  };

  return (
    <>
      <OnboardingForm
        defaultName={user.fullName ?? ""}
        onComplete={saveProfile}
        submitting={saving}
      />
      {error && (
        <p
          role="alert"
          className="fixed bottom-6 left-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-800 shadow-sm"
        >
          {error}
        </p>
      )}
    </>
  );
}
