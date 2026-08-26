from app.schemas.enums import FuelType, PetStage, TransitMode

# REQ-001: sign-up is restricted to Monash accounts. 
MONASH_EMAIL_DOMAINS = ("@student.monash.edu", "@monash.edu")

# Plausibility ceilings, matching the limits the NRCan import pipeline applied,
# so hand-typed and imported figures share one range. L/100km covers petrol,
# diesel and hybrid; electric is measured in kWh/100km.
MAX_CONSUMPTION_L_PER_100KM = 30.0
MAX_CONSUMPTION_KWH_PER_100KM = 45.0

# kg CO2-e per litre burnt. NGA Factors 2024 Table 9
EMISSION_FACTORS: dict[FuelType, float] = {
    "petrol": 2.31,
    "diesel": 2.72,
    "hybrid": 2.31,
    "electric": 0.0,
}

# kg CO2-e per passenger-km
TRANSIT_FACTORS: dict[TransitMode, float] = {
    "train": 0.038,
    "bus": 0.077,
    "tram": 0.0,
    "walk": 0.0
}

# kg CO2-e per km for the counterfactual "they would have driven themselves".
# (11.1 / 100) x 2.31, where 11.1 L/100km is the Australian passenger-vehicle
# average from the ABS Survey of Motor Vehicle Use, 12 months to 30 June 2020
# (real-world fuel purchased over distance, not a laboratory rating), and 2.31
# is the petrol factor, petrol dominating the light passenger fleet.
#
# ASSUMPTION: every passenger would otherwise have driven alone. 
FLEET_AVG_RATE = (11.1 / 100) * 2.31

# $ per kWh. Victorian Default Offer 2026-27 residential single-rate usage
# charge, GST inclusive, effective 1 July 2026, mean of the five distribution
# zones (Essential Services Commission, 2026). Assumes home charging on a flat
# tariff. 
ELECTRICITY_PRICE = 0.2820

# $ per trip. Myki 2-hour fare, Zone 1+2, effective 1 January 2026. All
# campuses fall inside the metropolitan network, so one flat fare applies.
MYKI_FULL_FARE = 5.70
MYKI_CONCESSION_FARE = 2.85

# Cumulative kg CO2 avoided to reach each stage. Targets roughly
# 3 / 9 / 28 / 111 rides at a typical 18 km trip with 2 passengers (7.26 kg).
PET_STAGE_THRESHOLDS: tuple[tuple[float, PetStage], ...] = (
    (800.0, "legendary"),
    (200.0, "adult"),
    (60.0, "juvenile"),
    (15.0, "hatched"),
    (0.0, "egg"),
)