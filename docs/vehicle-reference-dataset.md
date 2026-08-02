# Vehicle Reference Dataset

How `vehicle_reference` is built, what was changed from the source data, and why.

Producer: `backend/scripts/prepare_vehicle_reference.py`
Output: `backend/data/vehicle_reference.csv` (17,344 rows, committed)
Raw inputs: `backend/data/raw/` (gitignored, re-downloadable by the script)

Regenerate with:

```
cd backend
uv run --group seed python scripts/prepare_vehicle_reference.py
```

---

## 1. Why not the Kaggle dataset

The proposal cites [kaggle.com/datasets/debajyotipodder/co2-emission-by-vehicles](https://www.kaggle.com/datasets/debajyotipodder/co2-emission-by-vehicles). On inspection that dataset is a 7,385-row redistribution of a subset of Natural Resources Canada's *Fuel consumption ratings*, and it has three disqualifying limitations:

1. **No hybrid or electric vehicles.** NRCan publishes those as separate files, which the Kaggle snapshot omits. Our `FUEL_TYPE` enum has four values; the Kaggle file can populate two.
2. **Frozen in time.** It is a static upload with no update path.
3. **Requires authenticated download.** Kaggle needs an API token, so the pipeline could not be reproduced by a teammate or by CI without credential sharing.

We use the upstream source directly instead. It is the same data, more of it, citable to a government publisher, downloadable without authentication, and licensed under the [Open Government Licence - Canada](https://open.canada.ca/en/open-government-licence-canada).

## 2. Source data

All six files come from [Fuel consumption ratings](https://open.canada.ca/data/en/dataset/98f1a129-f628-4ce4-b24d-6f16bf24dd64), Natural Resources Canada, via the Government of Canada Open Government Portal. Retrieved 2 August 2026.

| File | Model years | Rows | Contents |
|---|---|---|---|
| `original-my1995-2014-fuel-consumption-ratings-2-cycle.csv` | 1995-2014 | 17,766 | conventional, 2-cycle test |
| `my2015-2024-fuel-consumption-ratings.csv` | 2015-2024 | 10,060 | conventional, 5-cycle test |
| `my2025-fuel-consumption-ratings.csv` | 2025 | 701 | conventional, 5-cycle test |
| `my2026-fuel-consumption-ratings.csv` | 2026 | 597 | conventional, 5-cycle test |
| `my2012-2026-battery-electric-vehicles.csv` | 2012-2026 | 1,212 | battery electric |
| `my2012-2026-plug-in-hybrid-electric-vehicles.csv` | 2012-2026 | 401 | plug-in hybrid |

**30,737 raw rows in, 17,344 out.**

## 3. Transformations

### 3.1 Fuel type mapping

NRCan encodes fuel as a single letter. Mapping onto our `FUEL_TYPE` enum:

| Code | NRCan meaning | Mapped to | Rationale |
|---|---|---|---|
| `X` | Regular gasoline | `petrol` | |
| `Z` | Premium gasoline | `petrol` | NGA Factors 2024 gives one petrol factor (2.31 kg CO2-e/L) regardless of octane, so the distinction cannot affect emissions |
| `D` | Diesel | `diesel` | |
| `E` | E85 ethanol | **dropped** | no enum member; E85 has a materially different emission factor and would be silently miscounted as petrol |
| `N` | Natural gas | **dropped** | no enum member; same reason |
| `B` | Electricity (BEV file) | `electric` | |

Dropped: 1,101 E85 rows and 39 natural gas rows.

### 3.2 Hybrid classification

NRCan has no "hybrid" fuel code. Non-plug-in hybrids sit in the conventional files rated in L/100 km, indistinguishable from petrol cars except by name. Two rules recover them:

1. Model name contains "hybrid" (catches `Camry Hybrid`, `Corolla Hybrid`, and ~450 others).
2. An explicit list of hybrid-only nameplates that never carry the word: Toyota Prius, Honda Insight, Honda CR-Z, Lexus CT.

Plug-in hybrids come from their own file and are all classified `hybrid`.

**This reclassification cannot change any emissions result.** `CLAUDE.md` assigns hybrids the petrol factor, so a hybrid misfiled as petrol yields identical CO2. The classification exists so the UI can label the vehicle correctly and so the fuel-price lookup is right.

### 3.3 Plug-in hybrid consumption figure

A PHEV has two ratings: an electric-mode figure (Le/100 km) and a charge-sustaining petrol figure (L/100 km). We take the **petrol figure**.

Reasoning: Monash campus-to-campus trips are typically longer than a PHEV's electric-only range (commonly 40-60 km, and the driver may arrive uncharged). The petrol figure is the conservative choice, and it keeps every liquid-fuel row on the same L/100 km unit.

This overstates emissions for a driver who charges nightly and drives a short pair like Clayton to Caulfield. Documented as a known conservative bias.

### 3.4 Model year floor

Rows before **model year 2005** are dropped. Two reasons: vehicles over 20 years old are a small share of the student fleet, and the pre-2015 file uses NRCan's superseded 2-cycle test procedure.

**Known caveat:** rows for model years 2005-2014 still come from the 2-cycle file, so their figures are optimistic relative to 2015+ rows. This is a real inconsistency. It was accepted rather than dropping ten model years of common student cars, on the reasoning that the bias applies equally to the solo and rideshare branches of the calculation. Since `co2_saved = co2_solo - co2_solo/n`, a proportional bias in consumption cancels out of the *comparison* and affects only the absolute magnitude.

### 3.5 Australian market filter

The source covers vehicles sold in Canada. Rows are filtered to an explicit allowlist of 43 makes with official Australian distribution since 2005 (`AUSTRALIAN_MAKES` in the script).

**Excluded** as North America only: Acura, Buick, Lincoln, Mercury, Oldsmobile, Plymouth, Pontiac, Saturn, Scion, Geo, Eagle, Hummer, SRT, Cadillac, Daewoo, Fisker, Karma, Lucid, Rivian, VinFast.

### 3.6 Holden reconstruction

Holden was Australia's largest domestic brand until its 2020 closure and is entirely absent from Canadian data. Most of its later range was a rebadged GM model that NRCan does list, so those rows are duplicated under the Holden name:

| NRCan | Holden |
|---|---|
| Chevrolet Cruze, Colorado, Trax, Equinox, Malibu, Trailblazer, Captiva, Volt | same nameplate |
| Chevrolet Spark / Sonic | Barina Spark / Barina |
| GMC Acadia | Acadia |

248 Holden rows generated.

**Deliberately excluded:** Toyota Tacoma is *not* aliased to HiLux, and the US Ford Ranger is *not* aliased to the Australian Ranger. Despite shared names or segments these are different vehicles on different platforms with different consumption. Aliasing them would produce confidently wrong numbers, which is worse than a missing row.

A first implementation matched model names by prefix and mapped Chevrolet `SSR` (a 6.0 L roadster pickup) onto Holden Commodore. Matching is now on whole nameplate tokens, and the Commodore mapping was removed because no genuine source row exists.

### 3.7 Australian nameplates

Same vehicle, different name between markets:

| NRCan | Australia |
|---|---|
| Mazda3 / Mazda5 / Mazda6 | 3 / 5 / 6 |
| Hyundai Elantra GT | i30 |

Trim suffixes are preserved: `Elantra GT Sport` becomes `i30 Sport`.

### 3.8 Deduplication

One row per `(make, model, year, fuel_type, engine_size)`. Trim variants that differ only by transmission or wheel size are averaged.

**`engine_size` is part of the key, not an averaged value.** An earlier version grouped without it and averaged displacement, which turned the 2020 Corolla's real 1.8 L and 2.0 L variants into a fictitious "1.9 L" row whose consumption matched neither. This forced a schema change: `vehicle_reference_unique_vehicle` now covers five columns and uses `NULLS NOT DISTINCT`, since `engine_size` is NULL for every electric row.

### 3.9 Other cleaning

- Trailing whitespace stripped from makes (`"Ford "`, `"Tesla "` appear in the source and would otherwise create duplicate manufacturers)
- `smart EQ` normalised to `smart`
- Rows with a missing `avg_consumption` or `year` dropped
- Rows outside plausibility bounds dropped: 0 < L/100 km <= 30, 0 < kWh/100 km <= 45
- Encoding handled per file: MY2025 is cp1252, the rest UTF-8

## 4. Output

17,344 rows, 43 makes, model years 2005-2026.

| fuel_type | Rows | Unit of `avg_consumption` |
|---|---|---|
| petrol | 15,160 | L/100 km |
| electric | 970 | **kWh/100 km** |
| hybrid | 882 | L/100 km |
| diesel | 332 | L/100 km |

**The unit varies by fuel type.** This is the single most dangerous property of the table. Any code doing arithmetic on `avg_consumption` must branch on `fuel_type` first, or an EV's running cost comes out roughly ten times too low.

Automated validation runs before the file is written and exits non-zero on: empty output, `fuel_type` outside the enum, nulls in any NOT NULL column, duplicates on the unique key, non-positive consumption, or L/100 km above the ceiling.

## 5. Accuracy against Australian figures

NRCan combined figures run roughly 15-25% higher than Australian ADR 81/02 label figures:

| Vehicle | NRCan | AU label |
|---|---|---|
| Mazda 3 (2020) | 7.7 | ~6.2 |
| Hyundai i30 (2018) | 8.6 | ~7.3 |
| Toyota Camry Hybrid (2024) | 4.9 | ~4.2 |

**This is an advantage, not a defect.** Canada's 5-cycle procedure includes cold start, air conditioning, and high-speed cycles; ADR 81/02 is NEDC-based and omits them. The Australian Automobile Association's Real-World Testing Program found that more than three-quarters of the internal-combustion and hybrid vehicles it tested consumed more fuel on-road than their label claims, with individual vehicles up to 21% higher ([realworld.org.au](https://realworld.org.au/)).

So the higher NRCan figures are closer to what a Monash driver actually burns. Using them makes our emissions estimates less flattering and more honest.

## 6. Known limitations

1. **Brands absent entirely.** MG, GWM, BYD, LDV, Chery, Haval, Skoda, Peugeot, Renault, Citroen, SsangYong. These are not sold in Canada. Several are now top-ten sellers in Australia: GWM, BYD, and MG together took roughly 12% of the 2025 Australian market ([VFACTS 2025](https://www.carexpert.com.au/car-news/vfacts-2025-another-record-year-for-new-vehicle-sales-in-australia-but-growth-modest-overall)). This is the largest coverage gap and it is growing.
2. **Model naming mismatches remain.** Toyota HiLux, Ford Ranger (pre-2019), Mitsubishi Triton, Isuzu D-Max and most utes are absent or represented by a different vehicle sharing the name.
3. **Australian-specific variants.** Where a model was sold in both markets with different engines, the Canadian specification is used.
4. **2-cycle inconsistency** for model years 2005-2014, as described in 3.4.
5. **PHEV conservative bias**, as described in 3.3.
6. **Systematically higher than Australian label figures**, by roughly 15-25%. Deliberate, and defended in section 5, but it means our figures will not match what a driver reads off their own fuel label. Expect users to query it; the answer is section 5.
7. **Unit ambiguity by fuel type**, as described in section 4. `avg_consumption` is L/100 km except for electric rows, where it is kWh/100 km. Nothing in the column's type prevents a caller from mixing them.
8. **Canadian trim names leak through.** Model strings are NRCan's (`Corolla XSE`, `Model 3 Long Range AWD (Import)`), not Australian trim names, so the vehicle picker will show unfamiliar variants.

### 6.1 Consequences for the rewards calculation

The adopted CO2 avoided formula (see [changes.md](changes.md) section 1) subtracts a term derived from the driver's actual vehicle:

```
co2_avoided = passengers x distance x FLEET_AVG_RATE - (passengers / occupants) x co2_solo
```

`co2_solo` comes from `vehicles.fuel_consumption`, which is copied from this table at registration. **So the accuracy of this dataset now affects green points, not only the comparison dashboard.**

Two consequences follow.

**A missing vehicle degrades to user input.** When a driver's car is absent (limitations 1 and 2), they type a consumption figure by hand and that number feeds the points calculation directly.

**That creates a gaming incentive.** Points rise as consumption falls, because a cleaner car means less of the ride's emissions are subtracted. A driver who enters `1.0 L/100km` for a V8 earns more than one who enters the truth. The exploit is small in absolute terms, capped by `passengers x distance x FLEET_AVG_RATE`, but it exists.

**Required mitigations:**

- `POST /vehicles` must accept a manually entered `fuel_consumption`. The reference lookup is a convenience that saves typing; it must never be a precondition for registering a vehicle. A driver whose car is absent can read the figure off their fuel label or [Green Vehicle Guide](https://www.greenvehicleguide.gov.au/).
- Manual entry must be bounded by the same plausibility limits the pipeline applies: 0 < L/100 km <= 30, 0 < kWh/100 km <= 45. This is a service-layer validation, since the database `CHECK` only enforces positivity.
- Where a reference row exists for the selected make, model, year and fuel type, prefer it over the submitted value rather than trusting the client.

## 7. Electricity price constant

EV cost uses **$0.2820 per kWh**.

Victorian Default Offer 2026-27 residential single-rate usage charge, GST inclusive, effective 1 July 2026, taken as the mean of the five Victorian distribution zones:

| Zone | c/kWh |
|---|---|
| AusNet Services | 31.98 |
| CitiPower | 25.96 |
| Jemena | 27.47 |
| Powercor | 28.22 |
| United Energy | 27.35 |
| **Mean** | **28.20** |

Source: Essential Services Commission (2026), [Victorian Default Offer price review 2026-27](https://www.esc.vic.gov.au/electricity-and-gas/prices-tariffs-and-benchmarks/victorian-default-offer/victorian-default-offer-price-review-2026-27).

**Assumptions:** home charging on a flat residential tariff. Off-peak charging (roughly 22 c/kWh) or public DC fast charging (substantially higher) would both give different figures. A single averaged constant matches how the myki fare and fuel price are handled elsewhere in the project. Lives in `core/constants.py` with this citation.

## 8. References

- Natural Resources Canada. *Fuel consumption ratings*. Government of Canada Open Government Portal. https://open.canada.ca/data/en/dataset/98f1a129-f628-4ce4-b24d-6f16bf24dd64 (Open Government Licence - Canada)
- Department of Climate Change, Energy, the Environment and Water. (2024). *National Greenhouse Accounts Factors 2024*.
- Essential Services Commission. (2026). *Victorian Default Offer price review 2026-27*. https://www.esc.vic.gov.au/electricity-and-gas/prices-tariffs-and-benchmarks/victorian-default-offer/victorian-default-offer-price-review-2026-27
- Australian Automobile Association. *Real-World Testing Program*. https://realworld.org.au/
- Federal Chamber of Automotive Industries. *VFACTS 2025 new vehicle sales*, reported in CarExpert. https://www.carexpert.com.au/car-news/vfacts-2025-another-record-year-for-new-vehicle-sales-in-australia-but-growth-modest-overall
- Podder, D. *CO2 Emission by Vehicles*. Kaggle. https://www.kaggle.com/datasets/debajyotipodder/co2-emission-by-vehicles (evaluated, superseded by the upstream NRCan source)
