"use client";

import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { api, FuelType, Vehicle, VehicleReference } from "@/lib/api";

const fuelLabels: Record<FuelType, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  hybrid: "Hybrid",
  electric: "Electric",
};

function consumptionLabel(fuelType: FuelType) {
  return fuelType === "electric" ? "kWh / 100 km" : "L / 100 km";
}

function rankedMatches(options: string[], query: string) {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return options.slice(0, 8);

  return options
    .map((option) => {
      const candidate = option.toLocaleLowerCase();
      let score = 4;
      if (candidate === search) score = 0;
      else if (candidate.startsWith(search)) score = 1;
      else if (candidate.split(/[\s/-]+/).some((word) => word.startsWith(search))) score = 2;
      else if (candidate.includes(search)) score = 3;
      return { option, score };
    })
    .filter(({ score }) => score < 4)
    .sort((left, right) => left.score - right.score || left.option.localeCompare(right.option))
    .slice(0, 8)
    .map(({ option }) => option);
}

export default function Home() {
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [references, setReferences] = useState<VehicleReference[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [manualFuel, setManualFuel] = useState<FuelType>("petrol");
  const [consumption, setConsumption] = useState("");
  const [manualEntry, setManualEntry] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadInitialData() {
      setLoading(true);
      setError("");
      try {
        const [nextMakes, nextVehicles] = await Promise.all([
          api<string[]>("/vehicles/reference/makes"),
          api<Vehicle[]>("/vehicles/me"),
        ]);
        setMakes(nextMakes);
        setVehicles(nextVehicles);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load vehicle setup.");
      } finally {
        setLoading(false);
      }
    }

    void loadInitialData();
  }, []);

  function typeMake(nextMake: string) {
    setMake(nextMake);
    setModel("");
    setYear("");
    setModels([]);
    setYears([]);
    setReferences([]);
    setReferenceId("");
    setConsumption("");
    setMessage("");
  }

  async function chooseMake(nextMake: string) {
    typeMake(nextMake);
    setError("");
    setLoadingModels(true);
    try {
      const path = `/vehicles/reference/models?make=${encodeURIComponent(nextMake)}`;
      setModels(await api<string[]>(path));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load models.");
    } finally {
      setLoadingModels(false);
    }
  }

  function typeModel(nextModel: string) {
    setModel(nextModel);
    setYear("");
    setYears([]);
    setReferences([]);
    setReferenceId("");
    setConsumption("");
  }

  async function chooseModel(nextModel: string) {
    typeModel(nextModel);
    setError("");
    setLoadingYears(true);
    try {
      const path = `/vehicles/reference/years?make=${encodeURIComponent(make)}&model=${encodeURIComponent(nextModel)}`;
      setYears(await api<number[]>(path));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load model years.");
    } finally {
      setLoadingYears(false);
    }
  }

  async function chooseYear(nextYear: string) {
    setYear(nextYear);
    setReferences([]);
    setReferenceId("");
    setConsumption("");
    setError("");
    if (!make || !model || !nextYear) return;

    try {
      const path = `/vehicles/reference?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${nextYear}`;
      const options = await api<VehicleReference[]>(path);
      setReferences(options);
      if (options.length === 1) chooseReference(String(options[0].id), options);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load vehicle details.");
    }
  }

  function chooseReference(nextReferenceId: string, options = references) {
    setReferenceId(nextReferenceId);
    const selected = options.find((option) => option.id === Number(nextReferenceId));
    if (selected) setConsumption(String(selected.avg_consumption));
  }

  function switchEntryMode() {
    setManualEntry((current) => !current);
    setMake("");
    setModel("");
    setYear("");
    setModels([]);
    setYears([]);
    setReferences([]);
    setReferenceId("");
    setConsumption("");
    setError("");
  }

  async function registerVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const selected = references.find((option) => option.id === Number(referenceId));
    const fuelType = manualEntry ? manualFuel : selected?.fuel_type;

    if (!make || !model || !year || !consumption || !fuelType || (!manualEntry && !selected)) {
      setError("Choose a reference vehicle, or complete the manual fields.");
      return;
    }

    setSaving(true);
    try {
      const vehicle = await api<Vehicle>("/vehicles", undefined, {
        method: "POST",
        body: JSON.stringify({
          make,
          model,
          year: Number(year),
          fuel_type: fuelType,
          fuel_consumption: Number(consumption),
        }),
      });
      setVehicles((current) => [vehicle, ...current]);
      setMessage(`${vehicle.year} ${vehicle.make} ${vehicle.model} is ready to use.`);
      setMake("");
      setModel("");
      setYear("");
      setModels([]);
      setYears([]);
      setReferences([]);
      setReferenceId("");
      setConsumption("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not register your vehicle.");
    } finally {
      setSaving(false);
    }
  }

  const selectedFuel =
    references.find((item) => item.id === Number(referenceId))?.fuel_type ?? "petrol";

  return (
    <main className="min-h-screen bg-[#f4f0e6] text-[#10261b]">
      <header className="border-b border-[#eff5de]/15 bg-[#082719] text-[#f9f6eb]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a className="font-serif text-xl font-bold tracking-tight" href="#top">
            MonashGO
          </a>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-[#d7e3cf] sm:inline">Vehicle setup</span>
            <span className="rounded-full bg-[#91d845] px-3 py-1 text-xs font-semibold text-[#082719]">
              Demo mode
            </span>
          </div>
        </div>
      </header>

      <section
        className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14 lg:py-14"
        id="top"
      >
        <div className="flex flex-col justify-between rounded-[2rem] bg-[#dceac9] p-7 sm:p-10 lg:min-h-[620px]">
          <div>
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-[#42792f]">
              Your driver profile
            </p>
            <h1 className="max-w-md font-serif text-5xl font-bold leading-[0.93] tracking-tight sm:text-6xl">
              Drive greener.
              <br />
              <span className="text-[#5fae36]">Go further.</span>
            </h1>
            <p className="mt-7 max-w-sm text-base leading-7 text-[#31503a]">
              Add your vehicle once. MonashGO will use its verified efficiency to make future
              ride impact estimates more meaningful.
            </p>
          </div>
          <div className="mt-10 border-t border-[#8dbd78] pt-6">
            <p className="font-serif text-2xl font-bold">Step 1 of 1</p>
            <p className="mt-1 text-sm text-[#31503a]">
              Vehicle registration and reference lookup
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#dcd7c9] bg-[#fffdf7] p-6 shadow-[0_18px_60px_rgba(20,47,28,0.09)] sm:p-10">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#5fae36]">
                Vehicle registration
              </p>
              <h2 className="mt-2 font-serif text-4xl font-bold tracking-tight">
                Tell us what you drive.
              </h2>
            </div>
            <button
              className="w-fit text-sm font-semibold text-[#356c2c] underline underline-offset-4"
              onClick={switchEntryMode}
              type="button"
            >
              {manualEntry ? "Use vehicle lookup" : "My vehicle is not listed"}
            </button>
          </div>

          {loading ? (
            <p className="mt-8 text-sm text-[#52635a]">Loading the vehicle catalogue...</p>
          ) : null}
          {error ? (
            <p className="mt-6 rounded-xl bg-[#fff0eb] px-4 py-3 text-sm text-[#9a371d]">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="mt-6 rounded-xl bg-[#e5f4d8] px-4 py-3 text-sm font-medium text-[#245e25]">
              {message}
            </p>
          ) : null}

          <form className="mt-8 space-y-5" onSubmit={registerVehicle}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Make">
                {manualEntry ? (
                  <input
                    className="field"
                    onChange={(event) => setMake(event.target.value)}
                    placeholder="e.g. Toyota"
                    required
                    value={make}
                  />
                ) : (
                  <Typeahead
                    disabled={loading}
                    label="Make"
                    onSelect={(item) => void chooseMake(item)}
                    onValueChange={typeMake}
                    options={makes}
                    placeholder="Start typing a make"
                    value={make}
                  />
                )}
              </Field>

              <Field label="Model">
                {manualEntry ? (
                  <input
                    className="field"
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="e.g. Corolla"
                    required
                    value={model}
                  />
                ) : (
                  <Typeahead
                    disabled={models.length === 0 || loadingModels}
                    label="Model"
                    onSelect={(item) => void chooseModel(item)}
                    onValueChange={typeModel}
                    options={models}
                    placeholder={loadingModels ? "Loading models..." : "Start typing a model"}
                    value={model}
                  />
                )}
              </Field>

              <Field label="Year">
                {manualEntry ? (
                  <input
                    className="field"
                    inputMode="numeric"
                    max="2100"
                    min="1950"
                    onChange={(event) => setYear(event.target.value)}
                    placeholder="e.g. 2020"
                    required
                    type="number"
                    value={year}
                  />
                ) : (
                  <select
                    className="field"
                    disabled={years.length === 0 || loadingYears}
                    onChange={(event) => void chooseYear(event.target.value)}
                    required
                    value={year}
                  >
                    <option value="">{loadingYears ? "Loading years..." : "Select year"}</option>
                    {years.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field label="Reference match">
                {manualEntry ? (
                  <select className="field" disabled>
                    <option>Manual entry</option>
                  </select>
                ) : (
                  <select
                    className="field"
                    disabled={!year || references.length === 0}
                    onChange={(event) => chooseReference(event.target.value)}
                    required
                    value={referenceId}
                  >
                    <option value="">Select fuel / engine</option>
                    {references.map((item) => (
                      <option key={item.id} value={item.id}>
                        {fuelLabels[item.fuel_type]}
                        {item.engine_size ? `, ${item.engine_size}L` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            {manualEntry ? (
              <Field label="Fuel type">
                <select
                  className="field"
                  onChange={(event) => setManualFuel(event.target.value as FuelType)}
                  value={manualFuel}
                >
                  {(Object.keys(fuelLabels) as FuelType[]).map((item) => (
                    <option key={item} value={item}>
                      {fuelLabels[item]}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field
              hint="Prefilled from the reference catalogue. You can correct it if needed."
              label={`Efficiency (${consumptionLabel(manualEntry ? manualFuel : selectedFuel)})`}
            >
              <input
                className="field"
                inputMode="decimal"
                min="0.1"
                onChange={(event) => setConsumption(event.target.value)}
                placeholder="e.g. 6.8"
                required
                step="0.1"
                type="number"
                value={consumption}
              />
            </Field>

            <button
              className="w-full rounded-2xl bg-[#82d63e] px-5 py-4 text-sm font-bold text-[#082719] transition hover:bg-[#a7e76b] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saving || loading}
              type="submit"
            >
              {saving ? "Saving your vehicle..." : "Register vehicle"}
            </button>
          </form>

          {vehicles.length > 0 ? (
            <section className="mt-9 border-t border-[#e4dfd3] pt-6">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#5c6e62]">
                Your registered vehicles
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {vehicles.map((vehicle) => (
                  <span
                    className="rounded-full bg-[#edf4e6] px-3 py-2 text-sm text-[#31503a]"
                    key={vehicle.id}
                  >
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Typeahead({
  disabled,
  label,
  onSelect,
  onValueChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  label: string;
  onSelect: (value: string) => void;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder: string;
  value: string;
}) {
  const listId = useId();
  const deferredValue = useDeferredValue(value);
  const matches = rankedMatches(options, deferredValue);
  const selectedValue = useRef("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  function select(item: string) {
    selectedValue.current = item;
    onSelect(item);
    setOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const wasOpen = open;
      setOpen(true);
      setActiveIndex((current) =>
        wasOpen ? Math.min(current + 1, Math.max(matches.length - 1, 0)) : 0,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && matches[activeIndex]) {
      event.preventDefault();
      select(matches[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        aria-activedescendant={open && matches[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-label={label}
        autoComplete="off"
        className="field"
        disabled={disabled}
        onBlur={() => {
          const exact = options.find(
            (option) => option.toLocaleLowerCase() === value.trim().toLocaleLowerCase(),
          );
          if (exact && selectedValue.current !== exact) select(exact);
          setOpen(false);
        }}
        onChange={(event) => {
          selectedValue.current = "";
          onValueChange(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        value={value}
      />
      {open && !disabled ? (
        <ul
          className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-[#cad6c4] bg-[#fffefa] p-1.5 shadow-[0_16px_35px_rgba(16,38,27,0.16)]"
          id={listId}
          role="listbox"
        >
          {matches.length > 0 ? (
            matches.map((item, index) => (
              <li
                aria-selected={index === activeIndex}
                className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm ${
                  index === activeIndex
                    ? "bg-[#dff1cf] font-semibold text-[#174c25]"
                    : "text-[#294231] hover:bg-[#eef5e8]"
                }`}
                id={`${listId}-${index}`}
                key={item}
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(item);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
              >
                {item}
              </li>
            ))
          ) : (
            <li className="px-3 py-2.5 text-sm text-[#68776d]">No matching {label.toLowerCase()}</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

function Field({ children, hint, label }: { children: ReactNode; hint?: string; label: string }) {
  return (
    <label className="block text-sm font-bold text-[#294231]">
      <span>{label}</span>
      {hint ? <span className="ml-2 text-xs font-normal text-[#67786c]">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}
