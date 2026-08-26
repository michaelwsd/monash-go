"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

import OnboardingForm, {
  type OnboardingProfile,
} from "@/components/sign-up-form";

export default function OnboardingPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const [error, setError] = useState<string | null>(null);

  if (!isLoaded) return null;

  if (!isSignedIn || !user) {
    router.replace("/sign-in");
    return null;
  }

  const saveProfile = async (profile: OnboardingProfile) => {
    setError(null);

    try {
      await user.update({
        unsafeMetadata: {
          onboarding: profile,
        },
      });
      router.replace("/");
    } catch {
      setError("We couldn't save your profile. Please try again.");
    }
  };

  return (
    <>
      <OnboardingForm
        defaultName={user.fullName ?? ""}
        onComplete={saveProfile}
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
