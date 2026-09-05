"use client";

import { useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { AlertCircle, Check, Loader2, Sprout } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { SelectField, TextField } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ApiError,
  CAMPUS_OPTIONS,
  campusLabel,
  updateProfile,
  type Campus,
  type User,
} from "@/lib/api";
import { useCurrentUser } from "@/lib/use-current-user";

const LABEL =
  "text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase";

/** Matches the backend's normalize_phone validator, so a bad number is caught
    here with a helpful line instead of coming back as a 422. */
const AU_PHONE = /^(\+?61|0)[2-478]\d{8}$/;

interface Draft {
  phone: string;
  homeCampus: Campus | "";
  isConcession: boolean;
}

function draftOf(user: User): Draft {
  return {
    phone: user.phone,
    homeCampus: user.home_campus ?? "",
    isConcession: user.is_concession,
  };
}

/**
 * Profile. Everything about you that the app stores, split by who owns it.
 *
 * Clerk owns the name, email and avatar, so those are shown but not editable -
 * PATCH /users/me does not accept them, and letting someone type into a field
 * the API will ignore is worse than showing it locked.
 *
 * Green points are ours but the rewards engine's, not the user's.
 */
export default function ProfilePage() {
  const { user: clerkUser } = useUser();
  const { user, status, setUser, reload } = useCurrentUser();

  return (
    <div className="flex flex-1 flex-col bg-muted/40">
      <AppHeader greenPoints={user?.green_points ?? 0} />

      <main className="mx-auto w-full max-w-[900px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold tracking-[-0.025em]">Profile</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your contact details and the campus you travel from.
          </p>
        </div>

        {status === "error" && (
          <Card className="items-center gap-2 p-8 text-center">
            <AlertCircle className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">
              We couldn&apos;t load your profile.
            </p>
            <Button variant="outline" size="lg" onClick={reload}>
              Try again
            </Button>
          </Card>
        )}

        {status === "loading" && <ProfileSkeleton />}

        {status === "ready" && user && (
          <div className="flex flex-col gap-3.5">
            {/* Identity, read-only. Clerk's, not ours. */}
            <Card className="gap-0 p-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className={LABEL}>Signed in as</p>
                  <p className="mt-0.5 truncate text-base font-semibold tracking-[-0.02em]">
                    {clerkUser?.fullName ?? user.full_name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <Badge
                    variant="outline"
                    className="gap-1 rounded-full border-eco-border bg-eco-muted font-medium text-eco-foreground"
                  >
                    <Sprout className="size-3 text-eco" aria-hidden />
                    <span className="tabular-nums">
                      {user.green_points.toLocaleString()}
                    </span>
                    pts
                  </Badge>
                  <Badge variant="secondary" className="rounded-full font-medium capitalize">
                    {user.role}
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Editable. Ours.

                Keyed on the row's id so the form remounts, and its state is
                seeded from props by useState rather than by an effect that
                copies props into state - which React 19 rejects outright, and
                which would clobber an edit in progress on any refetch. */}
            <TravelDetailsCard key={user.id} user={user} onSaved={setUser} />

            <Card className="gap-0 p-3.5">
              <p className={LABEL}>Member since</p>
              <p className="mt-0.5 text-sm">
                {new Date(user.joined_at).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                {user.home_campus && (
                  <span className="text-muted-foreground">
                    {" "}
                    &middot; travelling from {campusLabel(user.home_campus)}
                  </span>
                )}
              </p>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function TravelDetailsCard({
  user,
  onSaved,
}: {
  user: User;
  onSaved: (user: User) => void;
}) {
  const { getToken } = useAuth();
  const [draft, setDraft] = useState<Draft>(() => draftOf(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const phoneDigits = draft.phone.replace(/\s/g, "");
  const phoneValid = AU_PHONE.test(phoneDigits);
  const dirty =
    phoneDigits !== user.phone ||
    draft.homeCampus !== (user.home_campus ?? "") ||
    draft.isConcession !== user.is_concession;

  const save = async () => {
    if (!draft.homeCampus) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateProfile(
        {
          phone: phoneDigits,
          home_campus: draft.homeCampus,
          is_concession: draft.isConcession,
        },
        { token: await getToken() },
      );
      // The response is the stored row, so the parent's copy is refreshed
      // without a second request. The id is unchanged, so no remount.
      onSaved(updated);
      setDraft(draftOf(updated));
      setSaved(true);
    } catch (caught) {
      // A 4xx says something useful about what was sent; a 5xx says nothing a
      // person can act on, so it gets the generic line.
      setError(
        caught instanceof ApiError && caught.status < 500
          ? caught.message
          : "We couldn't save your profile. Please try again.",
      );
    }
    setSaving(false);
  };

  return (
    <Card className="gap-3.5 p-3.5">
      <p className="text-sm font-semibold">Travel details</p>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <TextField
          label="Phone"
          hint="Shared once a booking is confirmed"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0412 345 678"
          value={draft.phone}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
        />

        <SelectField
          label="Home campus"
          placeholder="Choose a campus"
          options={CAMPUS_OPTIONS}
          value={draft.homeCampus}
          onValueChange={(value) =>
            setDraft({ ...draft, homeCampus: value as Campus })
          }
        />
      </div>

      {draft.phone.length > 0 && !phoneValid && (
        <p className="text-xs text-destructive">
          That doesn&apos;t look like an Australian number. Try 0412 345 678.
        </p>
      )}

      {/* A checkbox would be the obvious control, but the fare it picks is
          money, so it says which fare in words rather than making someone
          infer it from a tick. */}
      <fieldset className="rounded-lg border border-border bg-muted/50 p-3">
        <legend className="px-1 text-sm font-medium">Myki fare</legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          <FareOption
            label="Concession"
            price="$2.85"
            detail="Students with a valid card"
            selected={draft.isConcession}
            onSelect={() => setDraft({ ...draft, isConcession: true })}
          />
          <FareOption
            label="Full fare"
            price="$5.70"
            detail="Staff and everyone else"
            selected={!draft.isConcession}
            onSelect={() => setDraft({ ...draft, isConcession: false })}
          />
        </div>
      </fieldset>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive-border bg-destructive-muted px-3 py-2.5 text-xs text-destructive"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* aria-live so the confirmation is announced, not just seen. */}
        <p aria-live="polite" className="text-xs font-medium text-eco-foreground">
          {saved && !dirty && (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5" aria-hidden />
              Saved
            </span>
          )}
        </p>
        <Button
          size="lg"
          className="w-full sm:w-auto"
          onClick={() => void save()}
          disabled={saving || !dirty || !phoneValid || !draft.homeCampus}
        >
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {saving ? "Saving" : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}

function FareOption({
  label,
  price,
  detail,
  selected,
  onSelect,
}: {
  label: string;
  price: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-eco ${
        selected
          ? "border-eco-border bg-eco-muted"
          : "border-border bg-background hover:bg-muted"
      }`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span
          className={`text-sm font-medium ${selected ? "text-eco-foreground" : ""}`}
        >
          {label}
        </span>
        <span
          className={`text-sm tabular-nums ${
            selected ? "text-eco-foreground" : "text-muted-foreground"
          }`}
        >
          {price}
        </span>
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">
        {detail}
      </span>
    </button>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-3.5" aria-hidden>
      {[0, 1].map((row) => (
        <Card key={row} className="gap-0 p-3.5">
          <div className="animate-pulse space-y-2.5">
            <div className="h-2 w-16 rounded bg-muted" />
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="h-3 w-32 rounded bg-muted" />
          </div>
        </Card>
      ))}
    </div>
  );
}
