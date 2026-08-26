import { useState } from "react";
import type {
  ComponentType,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import {
  Car,
  Bus,
  Users,
  MapPin,
  Check,
  ChevronLeft,
  GraduationCap,
  Briefcase,
  Leaf,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const CAMPUSES = [
  "Clayton",
  "Caulfield",
  "Peninsula",
  "Parkville",
  "Monash College",
] as const;
const FUEL_TYPES = ["Petrol", "Diesel", "Hybrid", "Electric", "Other"] as const;

type Campus = (typeof CAMPUSES)[number];
type FuelType = (typeof FUEL_TYPES)[number];
type Role = "Student" | "Staff" | "";
type TravelMode = "Drive" | "Carpool" | "Public Transport" | "";

export interface OnboardingProfile {
  name: string;
  role: Role;
  campuses: Campus[];
  mode: TravelMode;
  carMake: string;
  fuelType: FuelType | "";
}

interface OnboardingFormProps {
  defaultName?: string;
  onComplete?: (profile: OnboardingProfile) => void;
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

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/* One source of truth for field chrome, so the input and the select can never
   drift apart on border, radius, padding or focus ring. */
const FIELD =
  "w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600";

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function TextField({ label, ...props }: TextFieldProps) {
  return (
    <FieldLabel label={label}>
      <input {...props} className={`${FIELD} placeholder-gray-400`} />
    </FieldLabel>
  );
}

interface SelectFieldProps {
  label: string;
  placeholder: string;
  options: readonly string[];
  value: string;
  onValueChange: (value: string) => void;
}

/* A native <select>'s option list is drawn by the OS, so CSS cannot reach it:
   no radius, no padding, no token colours, and `color-scheme` in globals.css is
   the only lever over even its light/dark appearance. This is the Radix listbox
   instead - real DOM we own, so the panel matches the card in any theme, and
   keyboard navigation and typeahead come from the primitive.

   Radix has no concept of an empty option, so the placeholder lives on
   SelectValue. "" is passed through rather than collapsed to undefined: Radix
   already reads it as "nothing chosen", and undefined would make the component
   uncontrolled until the first pick. */
function SelectField({
  label,
  placeholder,
  options,
  value,
  onValueChange,
}: SelectFieldProps) {
  return (
    <FieldLabel label={label}>
      <Select value={value} onValueChange={onValueChange}>
        {/* The trigger ships at h-8 with token colours; these overrides sit it
            on the same chrome as TextField. `data-[size=default]:h-auto` rather
            than `h-auto` because the default height is set through a data
            attribute, which outranks a bare utility. */}
        <SelectTrigger
          className={`${FIELD} w-full justify-between data-[size=default]:h-auto data-placeholder:text-gray-400 focus-visible:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-600`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        {/* `popper` drops the panel below the field. The default,
            `item-aligned`, covers the trigger the way a native select does,
            which is what made the old menu look like it was floating loose. */}
        <SelectContent
          position="popper"
          align="start"
          sideOffset={6}
          className="w-(--radix-select-trigger-width)"
        >
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldLabel>
  );
}

export default function OnboardingForm({
  defaultName = "",
  onComplete = () => {},
}: OnboardingFormProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingProfile>({
    name: defaultName,
    role: "",
    campuses: [],
    mode: "",
    carMake: "",
    fuelType: "",
  });

  const needsCar = form.mode === "Drive" || form.mode === "Carpool";

  const toggleCampus = (campus: Campus) =>
    setForm((f) => ({
      ...f,
      campuses: f.campuses.includes(campus)
        ? f.campuses.filter((c) => c !== campus)
        : [...f.campuses, campus],
    }));

  const canContinue = [
    form.name.trim().length > 0 && form.role !== "",
    form.campuses.length > 0,
    form.mode !== "" && (!needsCar || form.carMake.trim().length > 0),
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
              <p className="mt-1 text-sm text-gray-500">
                Takes about a minute. This helps us match you with the right
                rides and work out your CO₂ savings.
              </p>
            </div>

            <TextField
              label="Name"
              placeholder="Your name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
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
                  onClick={() => setForm((f) => ({ ...f, role: "Student" }))}
                />
                <Chip
                  label="Staff"
                  icon={Briefcase}
                  selected={form.role === "Staff"}
                  onClick={() => setForm((f) => ({ ...f, role: "Staff" }))}
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
                Select all that apply. We&rsquo;ll show you rides on these routes
                first.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {CAMPUSES.map((campus) => (
                <Chip
                  key={campus}
                  label={campus}
                  icon={MapPin}
                  selected={form.campuses.includes(campus)}
                  onClick={() => toggleCampus(campus)}
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
                onClick={() => setForm((f) => ({ ...f, mode: "Drive" }))}
              />
              <ModeCard
                label="Carpool"
                description="Ride with others"
                icon={Users}
                selected={form.mode === "Carpool"}
                onClick={() => setForm((f) => ({ ...f, mode: "Carpool" }))}
              />
              <ModeCard
                label="Public transport"
                description="Bus, train, tram"
                icon={Bus}
                selected={form.mode === "Public Transport"}
                onClick={() =>
                  setForm((f) => ({ ...f, mode: "Public Transport" }))
                }
              />
            </div>

            {needsCar && (
              <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs text-gray-500">
                  Used to estimate CO₂ saved on shared trips.
                </p>
                <TextField
                  label="Car make & model"
                  placeholder="e.g. Toyota Corolla Hybrid"
                  value={form.carMake}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, carMake: e.target.value }))
                  }
                />
                <SelectField
                  label="Fuel type"
                  placeholder="Select fuel type"
                  options={FUEL_TYPES}
                  value={form.fuelType}
                  onValueChange={(fuelType) =>
                    setForm((f) => ({ ...f, fuelType: fuelType as FuelType }))
                  }
                />
              </div>
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
                  ["Role", form.role || "—"],
                  [
                    "Campuses",
                    form.campuses.length ? form.campuses.join(", ") : "—",
                  ],
                  ["Travel mode", form.mode || "—"],
                  ...(needsCar
                    ? ([
                        ["Car", form.carMake || "—"],
                        ["Fuel type", form.fuelType || "—"],
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

            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3">
              <Leaf className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-800">
                We&rsquo;ll use this to start tracking your CO₂ avoided from your very
                first trip.
              </p>
            </div>
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
            disabled={!canContinue}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              canContinue
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isLastStep ? "Finish setup" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
