# Changes to the Proposal

Decisions taken during implementation that depart from `docs/proposal.md`. Each entry records what changed, why, and what evidence supports it.

The proposal remains the authoritative specification for everything not listed here.

---

## 1. Rewards formula: CO2 avoided

**Status:** adopted
**Supersedes:** proposal §4.1 Algorithm 1 (CO2 saving) and §4.1 Algorithm 3 (green points)
**Affects:** `rewards_service`, `core/emissions.py`, `core/constants.py`, pet stage thresholds, accessory pricing
**Does not affect:** the comparison dashboard (see §1.7)

### 1.1 The old method

```
co2_solo      = distance_km x (fuel_consumption / 100) x emission_factor
co2_rideshare = co2_solo / occupants
co2_saved     = co2_solo - co2_rideshare
points        = floor(co2_saved x 100)
```

The saving was the difference between the driver's emissions alone and their per-head share once the car was shared.

### 1.2 The new method

```
occupants   = passengers + 1

co2_avoided = max(0,
    passengers x distance_km x FLEET_AVG_RATE
    - (passengers / occupants) x co2_solo
)

points      = floor(co2_avoided x 100)
```

Read as: the passengers **would have** emitted the first term driving themselves. Instead they emitted their **share** of this ride, the second term. The difference is what carpooling avoided.

The driver is excluded from the credit because they were making the trip regardless. That is what makes an unbooked ride worth exactly zero.

`passengers` counts `bookings` with status `confirmed` or `completed`, excluding the driver.

### 1.3 The new benchmark

```
FLEET_AVG_RATE = (11.1 / 100) x 2.31 = 0.2564 kg CO2-e per km
```

**11.1 L/100km** is the average fuel consumption of Australian passenger vehicles, from the ABS *Survey of Motor Vehicle Use*, 12 months ended 30 June 2020.

Why this figure:

- **Australian**, not derived from the Canadian reference data.
- **Real-world**, computed as fuel purchased ÷ kilometres travelled, not a laboratory rating. A counterfactual should reflect what a car actually burns.
- **Stable**, having sat between 11 and 12 L/100km across the whole series.

The petrol factor (2.31 kg CO2-e/L, NGA Factors 2024 Table 9) applies because petrol dominates the Australian light passenger fleet.

Caveat: that release was the survey's last; the ABS has since discontinued it. The figure should be revisited if a successor series appears.

**Assumed counterfactual:** every passenger would otherwise have driven alone. Some would have caught public transport, so the formula over-credits. This is a standard and defensible simplification **provided it stays stated**, and it is repeated in `core/constants.py` and in `CLAUDE.md`.

### 1.4 Why the old method was wrong

Two defects, both found by evaluating the formula against real vehicles from `vehicle_reference`.

**Defect 1: electric vehicles earned nothing.**

An EV has an emission factor of 0, so `co2_solo = 0`, so `co2_saved = 0`. The greenest drivers on the platform earned zero points, in an app whose entire purpose is rewarding low-emission travel.

**Defect 2: thirstier cars earned more.**

Because the saving was proportional to the driver's own emissions, a less efficient car produced a larger reward. Clayton to Caulfield, 18 km, 2 passengers:

| Vehicle | Old points |
|---|---|
| Tesla Model 3 | **0** |
| Toyota Camry Hybrid | 136 |
| Toyota Corolla | 197 |
| Ford F-150 diesel | **353** |

The F-150 driver earned infinitely more than the Tesla driver for the identical trip. This is the more serious of the two defects: it is not merely an omission but an incentive pointing the wrong way, and it would be difficult to defend in a green-travel application.

### 1.5 Why the new method is better

Same trip, 18 km, 2 passengers, using consumption figures from our own `vehicle_reference`:

| Vehicle | L or kWh/100km | Ride emits | Old points | New points |
|---|---|---|---|---|
| Tesla Model 3 RWD 2024 | 15.8 kWh | 0.00 kg | 0 | **923** |
| Toyota Camry Hybrid 2024 | 4.9 L | 2.04 kg | 136 | 787 |
| Toyota Corolla 2020 | 7.1 L | 2.95 kg | 197 | 726 |
| VW Golf 2015 | 8.05 L | 3.35 kg | 223 | 699 |
| Jeep Grand Cherokee 2020 | 11.3 L | 4.70 kg | 313 | 609 |
| Ford F-150 4X4 2020 | 10.8 L | 5.29 kg | 353 | 570 |

Four properties the old formula lacked:

1. **The ordering is correct.** Cleanest vehicle scores highest, thirstiest lowest, a 62% spread.
2. **Every carpool is rewarded.** No vehicle earns zero for carrying passengers.
3. **A solo drive is worth nothing.** With `passengers = 0` the formula evaluates to exactly 0, so posting rides nobody books earns nothing.
4. **It scales with occupancy.** More passengers, more avoided trips, more points. Corolla, 18 km: 0 / 314 / 726 / 1,163 / 1,610 points for 0 to 4 passengers.

### 1.6 Rejected alternative

An intermediate formulation was tested and rejected:

```
co2_avoided = (passengers + 1) x distance x FLEET_AVG_RATE - co2_solo
```

It produced the right ordering but credited the driver's own trip against the fleet average, so **a solo drive scored points**: 166 for a Corolla, 462 for a Tesla, with no passengers at all. Unacceptable in a carpooling application. The adopted formula counts only the passengers' share, which forces the zero-passenger case to zero.

### 1.7 What did not change

**The comparison dashboard.** `GET /compare/{ride_id}` still uses `co2_solo` and `co2_rideshare` computed from the driver's actual vehicle. It answers a different question, "what does this trip cost in each mode?", and a Prius and an F-150 must produce visibly different dashboards. REQ-004 depends on this.

**The points conversion**, still `floor(co2_avoided x 100)`.

**The database schema.** `rides.co2_saved` still stores a single float. No migration required.

**Transit and cost formulas**, unchanged.

### 1.8 Numerical validation

Verified against `backend/data/vehicle_reference.csv`:

- Hand-check: 2 passengers × 18 km at 11.1 L/100km is 4.00 L of petrol not burned; 4.00 × 2.31 = 9.24 kg. The Tesla case (where the ride itself emits nothing) gives 9.23 kg. Consistent.
- Negative-result scan: all 17,344 reference vehicles at 1-4 passengers, 18 km. **6 of 69,376 combinations** clamp to zero, all vehicles above 20 L/100km (Lamborghini Aventador and similar). The `max(0, ...)` guard is defensive rather than load-bearing.
- Monotonicity: output increases with passenger count and decreases with the driver's consumption, across all tested vehicles and all eight campus pairs.

---

## 2. Pet stage thresholds

**Status:** adopted
**Supersedes:** proposal pet progression figures
**Reason:** §1 changed the magnitude of CO2 avoided by roughly 3.7x, so the old thresholds no longer pace a semester.

### 2.1 Old versus new

| Stage | Proposal | New | Rides to reach |
|---|---|---|---|
| egg | 0 kg | 0 kg | - |
| hatched | 5 kg | **15 kg** | 3 |
| juvenile | 25 kg | **60 kg** | 9 |
| adult | 100 kg | **200 kg** | 28 |
| legendary | 500 kg | **800 kg** | 111 |

Ride counts assume a typical 18 km trip with 2 passengers, worth 7.26 kg.

### 2.2 Why

Under the old formula the progression was unreachable: legendary took **255 rides** at 1.97 kg each, which nobody completes in a twelve-week semester.

Under the new formula with the old thresholds it collapses the other way: hatched in **1 ride**, juvenile in **4**. A single Peninsula-City trip with 4 passengers is 49 kg, clearing juvenile (25 kg) instantly. The entire early progression disappears in a user's first week, which removes the mechanic that gamification is supposed to provide.

The new thresholds target an arc of roughly 3 / 9 / 28 / 111 rides: early feedback within the first week, with legendary aspirational but attainable across a year of regular carpooling.

### 2.3 Consequence for the shop

Points per ride move from roughly 200 to between 500 and 2,500. Accessory prices must be set against the new scale or the entire catalogue is affordable after two rides. Not yet specified; to be set when the shop is built.

---

## 3. Vehicle reference dataset

**Status:** adopted
**Supersedes:** proposal §4.4 (Kaggle dataset as the vehicle data source)
**Detail:** full method, transformations, and references in [vehicle-reference-dataset.md](vehicle-reference-dataset.md)

Summary of the departure: the proposal cites a Kaggle redistribution of Natural Resources Canada data. That file contains no hybrid or electric vehicles, never updates, and requires an authenticated download. We use the upstream NRCan open data directly, which is the same data, has more of it (30,737 raw rows against 7,385), covers all four `FUEL_TYPE` enum values, and downloads without credentials so CI and teammates can reproduce it.

Two schema consequences, both already applied to `0001_init.sql`:

- `vehicle_reference.fuel_type` uses the `fuel_type` enum rather than `TEXT`, so a failed normalisation breaks the import loudly instead of poisoning the emissions calculation.
- `vehicle_reference_unique_vehicle` covers `(make, model, year, fuel_type, engine_size)` with `NULLS NOT DISTINCT`, because the same nameplate ships with multiple displacements in one model year.

**Known limitation carried forward:** MG, GWM, BYD, LDV, Chery and Haval are absent because they are not sold in Canada, and those brands were roughly 12% of the 2025 Australian market. `POST /vehicles` must therefore accept a manually entered `fuel_consumption`; the reference lookup is a convenience, never a precondition.

---

## 4. Electricity price constant

**Status:** adopted
**Fills a gap:** the proposal's cost algorithm assumes litres of liquid fuel and has no path for electric vehicles

`ELECTRICITY_PRICE = $0.2820 per kWh`

Victorian Default Offer 2026-27 residential single-rate usage charge, GST inclusive, effective 1 July 2026, taken as the mean of the five Victorian distribution zones (Essential Services Commission, 2026).

Without this, an EV's running cost is computed by multiplying kWh/100km by a **petrol** price, producing a figure roughly ten times too low. Cost calculations must branch on `fuel_type`.

---

## 5. Campus routes are directional

**Status:** adopted
**Supersedes:** proposal §4.3 step 3, "all 10 campus pairs"

Routes are stored per ordered pair: 5 campuses give 20 ordered pairs, × 2 travel modes = **40 rows**, not 20.

Clayton→City and City→Clayton are separate rows because transit timetables, interchange points, and driving durations differ by direction. The alternative, storing 20 symmetric rows, would require normalising the campus pair on every read, which is a bug waiting to happen for the sake of 20 rows. Seed with `itertools.permutations`, not `combinations`.

---

## 6. Corrected constants

**Status:** applied

`CLAUDE.md` originally carried emission factors that disagreed with the proposal. The proposal, which shows its derivation in §4.1 Table 4, is authoritative and `CLAUDE.md` was corrected to match.

| Constant | Was in CLAUDE.md | Corrected to |
|---|---|---|
| Diesel | 2.68 kg CO2-e/L | 2.72 |
| Train | 0.041 kg CO2-e/pkm | 0.038 |
| Bus | 0.079 kg CO2-e/pkm | 0.077 |
| Tram | 0.055 kg CO2-e/pkm | **0** (network 100% solar since 2019) |
| Allowed email domains | `@student.monash.edu` only | plus `@monash.edu` |

---

## References

- Australian Bureau of Statistics. (2020). *Survey of Motor Vehicle Use, Australia, 12 months ended 30 June 2020*. https://www.abs.gov.au/statistics/industry/tourism-and-transport/survey-motor-vehicle-use-australia/latest-release
- Department of Climate Change, Energy, the Environment and Water. (2024). *National Greenhouse Accounts Factors 2024*.
- Essential Services Commission. (2026). *Victorian Default Offer price review 2026-27*. https://www.esc.vic.gov.au/electricity-and-gas/prices-tariffs-and-benchmarks/victorian-default-offer/victorian-default-offer-price-review-2026-27
- Natural Resources Canada. *Fuel consumption ratings*. https://open.canada.ca/data/en/dataset/98f1a129-f628-4ce4-b24d-6f16bf24dd64
- Australian Automobile Association. *Real-World Testing Program*. https://realworld.org.au/
