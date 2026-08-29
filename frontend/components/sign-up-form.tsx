"use client";

import { useState } from "react";
import type { ComponentType, ButtonHTMLAttributes, ReactNode } from "react";
import {
  Car,
  Bus,
  Users,
  MapPin,
  Check,
  ChevronLeft,
  GraduationCap,
  Briefcase,
} from "lucide-react";

import { TextField } from "@/components/form-fields";
import VehiclePicker, {
  EMPTY_CAR,
  fuelTypeLabel,
  isCarUsable,
  type CarDetails,
} from "@/components/vehicle-picker";
import { consumptionUnit, type Campus } from "@/lib/api";

// ---------------------------------------------------------------------------
// MonashGo onboarding form
//
// Drop this in right after Clerk sign-up (e.g. as the landing route a new
// user is redirected to before they ever see the dashboard). Wire it up by
// passing `onComplete` — it receives the finished profile object, which is
// where you'd POST to your API / write to Clerk's `publicMetadata` before
// routing to "/dashboard".
//
//   <OnboardingForm
//     defaultName={user.fullName}
//     onComplete={(profile) => saveProfileAndRedirect(profile)}
//   />
// ---------------------------------------------------------------------------

/* Values are the CAMPUS enum the backend stores; labels are what the user
   reads. Same split as the fuel types, for the same reason. */
const CAMPUSES: readonly { value: Campus; label: string }[] = [
  { value: "clayton", label: "Clayton" },
  { value: "caulfield", label: "Caulfield" },
  { value: "peninsula", label: "Peninsula" },
  { value: "parkville", label: "Parkville" },
  { value: "city", label: "City" },
];

function campusLabel(value: Campus | undefined): string {
  return CAMPUSES.find((campus) => campus.value === value)?.label ?? "";
}

type Role = "Student" | "Staff" | "";
type TravelMode = "Drive" | "Carpool" | "Public Transport" | "";

/** Mirrors the backend's rule in app/schemas/user.py. */
const PHONE_PATTERN = /^(\+?61|0)[2-478]\d{8}$/;

function isValidPhone(phone: string): boolean {
  return PHONE_PATTERN.test(phone.replace(/\s/g, ""));
}

export interface OnboardingProfile {
  name: string;
  phone: string;
  role: Role;
  isConcession: boolean;
  /** The first is written to users.home_campus; the table holds only one. */
  campuses: Campus[];
  mode: TravelMode;
  /** null for anyone who isn't driving themselves */
  car: CarDetails | null;
}

interface OnboardingFormProps {
  defaultName?: string;
  onComplete?: (profile: OnboardingProfile) => void;
  /** Disables the final button while the profile is being saved. */
  submitting?: boolean;
}

const STEP_LABELS = [
  "About you",
  "Campuses",
  "Getting there",
  "Review",
] as const;

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-wide text-gray-500 uppercase mb-2">
      {children}
    </p>
  );
}

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  selected: boolean;
  icon?: ComponentType<{ className?: string }>;
}

function Chip({ label, selected, icon: Icon, ...props }: ChipProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
        selected
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
      }`}
    >
      {selected ? (
        <Check className="h-3.5 w-3.5" />
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5" />
      ) : null}
      {label}
    </button>
  );
}

interface ModeCardProps {
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  selected: boolean;
  onClick: () => void;
}

function ModeCard({
  label,
  description,
  icon: Icon,
  selected,
  onClick,
}: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
        selected
          ? "border-gray-900 bg-gray-50"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <Icon
          className={`h-5 w-5 ${selected ? "text-gray-900" : "text-gray-400"}`}
        />
        {selected && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-900">
            <Check className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </button>
  );
}

export default function OnboardingForm({
  defaultName = "",
  onComplete = () => {},
  submitting = false,
}: OnboardingFormProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingProfile>({
    name: defaultName,
    phone: "",
    role: "",
    isConcession: false,
    campuses: [],
    mode: "",
    car: null,
  });

  /* Drive only. A carpooler rides in someone else's car, so their own make and
     fuel type describe a vehicle that never makes the trip - the emissions come
     from the driver's vehicle, which the ride itself already carries. */
  const needsCarDetails = form.mode === "Drive";

  /* Switching away from Drive drops the car rather than just hiding it.
     Otherwise a make typed under Drive survives in state and is saved with a
     Carpool profile, where nothing will ever read it. */
  const selectMode = (mode: TravelMode) =>
    setForm((f) => ({
      ...f,
      mode,
      car: mode === "Drive" ? (f.car ?? EMPTY_CAR) : null,
    }));

  /* Students are on a concession fare by default and staff are not, but the
     chips below stay editable - a staff member can hold one, and a student may
     not have registered theirs. */
  const selectRole = (role: Role) =>
    setForm((f) => ({ ...f, role, isConcession: role === "Student" }));

  const toggleCampus = (campus: Campus) =>
    setForm((f) => ({
      ...f,
      campuses: f.campuses.includes(campus)
        ? f.campuses.filter((c) => c !== campus)
        : [...f.campuses, campus],
    }));

  const canContinue = [
    form.name.trim().length > 0 &&
      isValidPhone(form.phone) &&
      form.role !== "",
    form.campuses.length > 0,
    form.mode !== "" && (!needsCarDetails || isCarUsable(form.car ?? EMPTY_CAR)),
    true,
  ][step];

  const isLastStep = step === STEP_LABELS.length - 1;

  const handlePrimary = () => {
    if (isLastStep) {
      onComplete(form);
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    /* `flex-1`, not `min-h-full`: <body> is `min-h-full flex flex-col` with
       auto height, so a percentage min-height here resolves to zero and the
       grey ground stops at the card. Growing to fill the body's flex column
       is what app/sign-in does too. */
    <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-4 py-10">
      {/* Header, echoing the dashboard's top bar */}
      <div className="w-full max-w-lg mb-6 flex items-center justify-between">
        <span className="text-lg font-bold text-gray-900">MonashGo</span>
        <span className="text-xs font-medium text-gray-500">
          Step {step + 1} of {STEP_LABELS.length}
        </span>
      </div>

      {/* Progress bar, same visual language as the rewards bar on the dashboard */}
      <div className="w-full max-w-lg mb-6 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all duration-300"
          style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <Eyebrow>About you</Eyebrow>
              <h1 className="text-xl font-bold text-gray-900">
                Let&rsquo;s set up your profile
              </h1>
            </div>

            <TextField
              label="Name"
              placeholder="Your name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />

            {/* Only shared with a driver once a booking is confirmed, which is
                worth saying here - it is the one field people hesitate over. */}
            <TextField
              label="Mobile"
              hint="shared only after a booking"
              placeholder="0412 345 678"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />

            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700">
                I am a
              </span>
              <div className="flex gap-2">
                <Chip
                  label="Student"
                  icon={GraduationCap}
                  selected={form.role === "Student"}
                  onClick={() => selectRole("Student")}
                />
                <Chip
                  label="Staff"
                  icon={Briefcase}
                  selected={form.role === "Staff"}
                  onClick={() => selectRole("Staff")}
                />
              </div>
            </div>

            {/* Asked outright rather than inferred. Picking a role sets the
                usual answer, but concession status is the user's to state: it
                decides which myki fare every comparison is priced against. */}
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700">
                Do you travel on a concession fare?
              </span>
              <div className="flex gap-2">
                <Chip
                  label="Yes"
                  selected={form.isConcession}
                  onClick={() => setForm((f) => ({ ...f, isConcession: true }))}
                />
                <Chip
                  label="No"
                  selected={!form.isConcession}
                  onClick={() => setForm((f) => ({ ...f, isConcession: false }))}
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <Eyebrow>Where you travel</Eyebrow>
              <h1 className="text-xl font-bold text-gray-900">
                Which campuses do you travel to?
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Select all that apply. The first one you pick becomes your home
                campus, and we&rsquo;ll show you rides on these routes first.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {CAMPUSES.map((campus) => (
                <Chip
                  key={campus.value}
                  label={campus.label}
                  icon={MapPin}
                  selected={form.campuses.includes(campus.value)}
                  onClick={() => toggleCampus(campus.value)}
                />
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <Eyebrow>Your travel mode</Eyebrow>
              <h1 className="text-xl font-bold text-gray-900">
                How do you usually get to campus?
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                We&rsquo;ll use this to personalise ride matches and impact tracking.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ModeCard
                label="Drive"
                description="Mostly drive myself"
                icon={Car}
                selected={form.mode === "Drive"}
                onClick={() => selectMode("Drive")}
              />
              <ModeCard
                label="Carpool"
                description="Ride with others"
                icon={Users}
                selected={form.mode === "Carpool"}
                onClick={() => selectMode("Carpool")}
              />
              <ModeCard
                label="Public transport"
                description="Bus, train, tram"
                icon={Bus}
                selected={form.mode === "Public Transport"}
                onClick={() => selectMode("Public Transport")}
              />
            </div>

            {needsCarDetails && (
              <VehiclePicker
                value={form.car ?? EMPTY_CAR}
                onChange={(car) => setForm((f) => ({ ...f, car }))}
              />
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <Eyebrow>Almost done</Eyebrow>
              <h1 className="text-xl font-bold text-gray-900">
                Here&rsquo;s your profile
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                You can update this any time from your account settings.
              </p>
            </div>

            <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {(
                [
                  ["Name", form.name || "—"],
                  ["Mobile", form.phone || "—"],
                  ["Role", form.role || "—"],
                  ["Fare", form.isConcession ? "Concession" : "Full"],
                  [
                    "Home campus",
                    campusLabel(form.campuses[0]) || "—",
                  ],
                  [
                    "Also travels to",
                    form.campuses.slice(1).map(campusLabel).join(", ") || "—",
                  ],
                  ["Travel mode", form.mode || "—"],
                  ...(needsCarDetails && form.car
                    ? ([
                        [
                          "Car",
                          [form.car.make, form.car.model, form.car.year]
                            .filter(Boolean)
                            .join(" ") || "—",
                        ],
                        ["Fuel type", fuelTypeLabel(form.car.fuelType) || "—"],
                        [
                          "Consumption",
                          `${form.car.fuelConsumption} ${consumptionUnit(form.car.fuelType)}`,
                        ],
                      ] as [string, string][])
                    : []),
                ] as [string, string][]
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <dt className="text-sm text-gray-500">{label}</dt>
                  <dd className="text-sm font-medium text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Footer nav */}
        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={handlePrimary}
            disabled={!canContinue || submitting}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              canContinue && !submitting
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isLastStep
              ? submitting
                ? "Saving\u2026"
                : "Finish setup"
              : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
