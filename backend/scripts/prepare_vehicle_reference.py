"""Build the vehicle_reference seed file from Natural Resources Canada open data.

Run:  uv run --group seed python scripts/prepare_vehicle_reference.py

Downloads six CSVs from the NRCan "Fuel consumption ratings" dataset, normalises
them into the shape of the vehicle_reference table, filters to makes sold in
Australia, and writes data/vehicle_reference.csv.

Full method, rationale, and citations: docs/vehicle-reference-dataset.md
"""

from __future__ import annotations

import re
import sys
import urllib.request
from pathlib import Path

import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BACKEND_DIR / "data" / "raw"
OUTPUT_PATH = BACKEND_DIR / "data" / "vehicle_reference.csv"

# NRCan Fuel Consumption Ratings, Open Government Licence - Canada.
# https://open.canada.ca/data/en/dataset/98f1a129-f628-4ce4-b24d-6f16bf24dd64
DATASET = "98f1a129-f628-4ce4-b24d-6f16bf24dd64"
BASE = f"https://open.canada.ca/data/dataset/{DATASET}/resource"

# local_name -> (resource id, published filename)
SOURCES = {
    "conventional_1995_2014.csv": (
        "29bcf157-9297-4d6a-9695-dfd816bc32ca",
        "original-my1995-2014-fuel-consumption-ratings-2-cycle.csv",
    ),
    "conventional_2015_2024.csv": (
        "c98b9dc8-b23f-4cd8-8b19-e892da1e4688",
        "my2015-2024-fuel-consumption-ratings.csv",
    ),
    "conventional_2025.csv": (
        "d589f2bc-9a85-4f65-be2f-20f17debfcb1",
        "my2025-fuel-consumption-ratings.csv",
    ),
    "conventional_2026.csv": (
        "9df1b18d-d036-4783-a61c-99f1f75b3ac5",
        "my2026-fuel-consumption-ratings.csv",
    ),
    "battery_electric.csv": (
        "026e45b4-eb63-451f-b34f-d9308ea3a3d9",
        "my2012-2026-battery-electric-vehicles.csv",
    ),
    "plugin_hybrid.csv": (
        "8812228b-a6aa-4303-b3d0-66489225120d",
        "my2012-2026-plug-in-hybrid-electric-vehicles.csv",
    ),
}

CONVENTIONAL_FILES = [
    "conventional_1995_2014.csv",
    "conventional_2015_2024.csv",
    "conventional_2025.csv",
    "conventional_2026.csv",
]

# NRCan fuel type codes, mapped onto the FUEL_TYPE enum.
# X and Z are both petrol: NGA Factors 2024 gives one petrol factor (2.31 kg/L)
# regardless of octane, so the distinction does not affect emissions.
# E (E85) and N (natural gas) have no enum member and are dropped.
FUEL_CODE_MAP = {"X": "petrol", "Z": "petrol", "D": "diesel"}

# Model year floor. Cars older than this are rare on campus and the pre-2005
# NRCan ratings use a superseded 2-cycle test procedure that overstates economy.
MIN_MODEL_YEAR = 2005

# Plausibility bounds used to reject bad rows outright.
MAX_LITRES_PER_100KM = 30.0
MAX_KWH_PER_100KM = 45.0

# Makes with official Australian distribution at some point since MIN_MODEL_YEAR.
# Curated by hand; see docs/vehicle-reference-dataset.md for what this excludes.
AUSTRALIAN_MAKES = {
    "Alfa Romeo",
    "Aston Martin",
    "Audi",
    "BMW",
    "Bentley",
    "Chevrolet",
    "Chrysler",
    "Dodge",
    "FIAT",
    "Ferrari",
    "Ford",
    "GMC",
    "Genesis",
    "Honda",
    "Hyundai",
    "INEOS",
    "Infiniti",
    "Isuzu",
    "Jaguar",
    "Jeep",
    "Kia",
    "Lamborghini",
    "Land Rover",
    "Lexus",
    "Lotus",
    "MINI",
    "Maserati",
    "Mazda",
    "Mercedes-Benz",
    "Mitsubishi",
    "Nissan",
    "Polestar",
    "Porsche",
    "Ram",
    "Rolls-Royce",
    "Saab",
    "Subaru",
    "Suzuki",
    "Tesla",
    "Toyota",
    "Volkswagen",
    "Volvo",
    "smart",
}

# Holden was Australia's largest domestic brand until 2020 and is absent from
# Canadian data. Most of its later range was a rebadge of a GM model that NRCan
# does list, so those rows are duplicated under the Holden name.
#
# Matching is on the leading word of the model only, so trim suffixes are kept
# but "SSR" can never be mistaken for "SS". Nameplates that merely sound alike
# across markets (Tacoma/HiLux, US Ranger/AU Ranger) are deliberately absent:
# they are different vehicles, not rebadges.
# (source_make, source_nameplate) -> holden_nameplate
HOLDEN_REBADGES = {
    ("Chevrolet", "Cruze"): "Cruze",
    ("Chevrolet", "Colorado"): "Colorado",
    ("Chevrolet", "Trax"): "Trax",
    ("Chevrolet", "Equinox"): "Equinox",
    ("Chevrolet", "Spark"): "Barina Spark",
    ("Chevrolet", "Sonic"): "Barina",
    ("Chevrolet", "Malibu"): "Malibu",
    ("Chevrolet", "Trailblazer"): "Trailblazer",
    ("Chevrolet", "Captiva"): "Captiva",
    ("Chevrolet", "Volt"): "Volt",
    ("GMC", "Acadia"): "Acadia",
}

# Same vehicle, different nameplate between the Canadian and Australian markets.
# Only exact equivalents are listed; near-equivalents are left alone.
# (make, canadian_nameplate) -> australian_nameplate
AUSTRALIAN_NAMEPLATES = {
    ("Mazda", "Mazda3"): "3",
    ("Mazda", "Mazda5"): "5",
    ("Mazda", "Mazda6"): "6",
    ("Hyundai", "Elantra GT"): "i30",
}

# Hybrid nameplates that never appear with "Hybrid" in the NRCan model string.
# Every other hybrid is caught by the name check in load_conventional.
HYBRID_ONLY_NAMEPLATES = {
    ("Toyota", "Prius"),
    ("Honda", "Insight"),
    ("Honda", "CR-Z"),
    ("Lexus", "CT"),
}


def download_sources() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for name, (resource_id, filename) in SOURCES.items():
        target = RAW_DIR / name
        if target.exists():
            print(f"  cached   {name}")
            continue
        print(f"  download {name}")
        url = f"{BASE}/{resource_id}/download/{filename}"
        with urllib.request.urlopen(url) as response:  # noqa: S310 - fixed https URLs
            target.write_bytes(response.read())


def read_csv(name: str) -> pd.DataFrame:
    """NRCan files are inconsistently encoded; MY2025 is cp1252, the rest UTF-8."""
    path = RAW_DIR / name
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return pd.read_csv(path, encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"could not decode {path} as utf-8-sig, cp1252, or latin-1")


def load_conventional() -> pd.DataFrame:
    """Petrol, diesel, and non-plug-in hybrid vehicles, rated in L/100 km."""
    frames = [read_csv(name) for name in CONVENTIONAL_FILES]
    df = pd.concat(frames, ignore_index=True)

    df = df.rename(
        columns={
            "Model year": "year",
            "Make": "make",
            "Model": "model",
            "Engine size (L)": "engine_size",
            "Fuel type": "fuel_code",
            "Combined (L/100 km)": "avg_consumption",
        }
    )[["year", "make", "model", "engine_size", "fuel_code", "avg_consumption"]]

    df["fuel_type"] = df["fuel_code"].map(FUEL_CODE_MAP)

    # Non-plug-in hybrids sit in this file rated in L/100 km and are only
    # identifiable by name. Reclassifying them does not change emissions (the
    # hybrid factor is the petrol factor) but it lets the UI label them.
    named_hybrid = df["model"].str.contains("hybrid", case=False, na=False)

    # Prius, Insight and similar are hybrid-only nameplates that never carry the
    # word in NRCan's model string, so the name check alone misses them.
    nameplate = df["make"].str.cat(df["model"].str.split().str[0], sep=" ")
    known_hybrid = nameplate.isin({f"{mk} {md}" for mk, md in HYBRID_ONLY_NAMEPLATES})

    df.loc[(named_hybrid | known_hybrid) & df["fuel_type"].eq("petrol"), "fuel_type"] = "hybrid"

    return df.drop(columns=["fuel_code"])


def load_battery_electric() -> pd.DataFrame:
    """Battery electric vehicles. avg_consumption is kWh/100 km, not litres."""
    df = read_csv("battery_electric.csv").rename(
        columns={
            "Model year": "year",
            "Make": "make",
            "Model": "model",
            "Combined (kWh/100 km)": "avg_consumption",
        }
    )[["year", "make", "model", "avg_consumption"]]

    df["engine_size"] = pd.NA  # electric motors have no displacement
    df["fuel_type"] = "electric"
    return df


def load_plugin_hybrid() -> pd.DataFrame:
    """Plug-in hybrids, using the charge-sustaining petrol figure.

    A PHEV has two ratings: an electric-mode Le/100 km and a petrol-mode
    L/100 km. Campus trips are mostly beyond electric-only range, so the
    petrol figure ("Fuel type 2") is the conservative choice and keeps the
    row consistent with the L/100 km unit used for every other liquid fuel.
    """
    df = read_csv("plugin_hybrid.csv").rename(
        columns={
            "Model year": "year",
            "Make": "make",
            "Model": "model",
            "Engine size (L)": "engine_size",
            "Combined (L/100 km)": "avg_consumption",
        }
    )[["year", "make", "model", "engine_size", "avg_consumption"]]

    df["fuel_type"] = "hybrid"
    return df


def add_holden_rebadges(df: pd.DataFrame) -> pd.DataFrame:
    """Duplicate GM rows under the Holden name for the Australian market."""
    nameplate = df["model"].str.split().str[0]
    rows = []
    for (source_make, source_nameplate), holden_nameplate in HOLDEN_REBADGES.items():
        matches = df[df["make"].eq(source_make) & nameplate.eq(source_nameplate)].copy()
        if matches.empty:
            continue
        matches["make"] = "Holden"
        matches["model"] = holden_nameplate
        rows.append(matches)

    if not rows:
        return df
    return pd.concat([df, *rows], ignore_index=True)


def rename_to_australian_nameplates(df: pd.DataFrame) -> pd.DataFrame:
    """Rename models that Australia sells under a different name.

    Nameplates can be more than one word ("Elantra GT"), so the match is on a
    whole-token prefix rather than the first word. Trim suffixes are preserved:
    "Elantra GT Sport" becomes "i30 Sport".
    """
    df = df.copy()

    for (make, canadian), australian in AUSTRALIAN_NAMEPLATES.items():
        pattern = rf"^{re.escape(canadian)}(?=\s|$)"
        match = df["make"].eq(make) & df["model"].str.match(pattern, na=False)
        df.loc[match, "model"] = (
            df.loc[match, "model"].str.replace(pattern, australian, regex=True).str.strip()
        )

    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # NRCan has trailing spaces on some makes ("Ford ", "Tesla ") which would
    # otherwise produce duplicate manufacturers.
    df["make"] = df["make"].astype(str).str.strip()
    df["model"] = df["model"].astype(str).str.strip()
    df["make"] = df["make"].replace({"smart EQ": "smart"})

    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df["engine_size"] = pd.to_numeric(df["engine_size"], errors="coerce")
    df["avg_consumption"] = pd.to_numeric(df["avg_consumption"], errors="coerce")

    # Rows whose fuel code had no enum member (E85, natural gas), and rows
    # missing the one figure the emissions formula cannot work without.
    df = df[df["fuel_type"].notna()]
    df = df[df["avg_consumption"].notna() & df["year"].notna()]

    df = df[df["year"] >= MIN_MODEL_YEAR]

    ceiling = (
        df["fuel_type"].eq("electric").map({True: MAX_KWH_PER_100KM, False: MAX_LITRES_PER_100KM})
    )
    df = df[df["avg_consumption"].gt(0) & df["avg_consumption"].le(ceiling)]

    df = add_holden_rebadges(df)
    df = df[df["make"].isin(AUSTRALIAN_MAKES | {"Holden"})]
    df = rename_to_australian_nameplates(df)

    # Collapse trim variants (transmission, wheel size) to their mean, but keep
    # engine_size in the grouping key. Averaging across displacements would
    # invent engines that do not exist: a 1.8 and a 2.0 Corolla would become a
    # single "1.9" row whose consumption matches neither.
    df["engine_size"] = df["engine_size"].fillna(-1.0)
    df = (
        df.groupby(["make", "model", "year", "fuel_type", "engine_size"], as_index=False)
        .agg(avg_consumption=("avg_consumption", "mean"))
        .round({"avg_consumption": 2})
    )
    df["engine_size"] = df["engine_size"].replace(-1.0, pd.NA)

    df["year"] = df["year"].astype(int)
    return df[["make", "model", "year", "fuel_type", "engine_size", "avg_consumption"]]


def validate(df: pd.DataFrame) -> None:
    """Fail loudly rather than seeding a database with unusable rows."""
    errors = []

    if df.empty:
        errors.append("output is empty")

    allowed = {"petrol", "diesel", "hybrid", "electric"}
    unexpected = set(df["fuel_type"]) - allowed
    if unexpected:
        errors.append(f"fuel_type values outside the enum: {sorted(unexpected)}")

    for column in ("make", "model", "year", "fuel_type", "avg_consumption"):
        if df[column].isna().any():
            errors.append(f"{column} contains nulls (NOT NULL in the schema)")

    # Matches UNIQUE NULLS NOT DISTINCT (make, model, year, fuel_type, engine_size).
    key = ["make", "model", "year", "fuel_type", "engine_size"]
    if df.fillna({"engine_size": -1}).duplicated(subset=key).any():
        errors.append("duplicate rows would violate vehicle_reference_unique_vehicle")

    if (df["avg_consumption"] <= 0).any():
        errors.append("non-positive avg_consumption")

    liquid = df[df["fuel_type"].ne("electric")]
    if liquid["avg_consumption"].gt(MAX_LITRES_PER_100KM).any():
        errors.append(f"L/100km above {MAX_LITRES_PER_100KM}")

    if errors:
        for error in errors:
            print(f"  FAIL {error}", file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    print("Downloading NRCan source data")
    download_sources()

    print("Normalising")
    combined = pd.concat(
        [load_conventional(), load_battery_electric(), load_plugin_hybrid()],
        ignore_index=True,
    )
    print(f"  {len(combined):,} raw rows")

    result = clean(combined)
    print(f"  {len(result):,} rows after cleaning")

    validate(result)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(OUTPUT_PATH, index=False)

    print(f"\nWrote {OUTPUT_PATH.relative_to(BACKEND_DIR)}")
    print(f"  makes        {result['make'].nunique()}")
    print(f"  model years  {result['year'].min()}-{result['year'].max()}")
    print("  by fuel type")
    for fuel_type, count in result["fuel_type"].value_counts().items():
        print(f"    {fuel_type:<9} {count:>6,}")


if __name__ == "__main__":
    main()
