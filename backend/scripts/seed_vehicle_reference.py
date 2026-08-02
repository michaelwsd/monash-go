import csv
import sys
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from supabase import Client, create_client

BACKEND_DIR = Path(__file__).resolve().parents[1]  # second parent dir
CSV_PATH = BACKEND_DIR / "data" / "vehicle_reference.csv"

# used to decide between insert and update (update avg_consumption)
CONFLICT_KEY = "make,model,year,fuel_type,engine_size"

BATCH_SIZE = 500


def get_client() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key.get_secret_value())


def read_rows() -> list[dict[str, Any]]:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        return [
            {
                "make": row["make"],
                "model": row["model"],
                "year": int(row["year"]),
                "fuel_type": row["fuel_type"],
                "engine_size": float(row["engine_size"]) if row["engine_size"] else None,
                "avg_consumption": float(row["avg_consumption"]),
            }
            for row in csv.DictReader(f)
        ]


# batched upsert into supabase
def seed(client: Client, rows: list[dict[str, Any]]) -> None:
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start : start + BATCH_SIZE]
        client.table("vehicle_reference").upsert(batch, on_conflict=CONFLICT_KEY).execute()
        print(f"  {min(start + BATCH_SIZE, len(rows)):>7,} / {len(rows):,}")


def verify(client: Client, expected: int) -> None:
    total = client.table("vehicle_reference").select("id", count="exact", head=True).execute()

    electric = (
        client.table("vehicle_reference")
        .select("id", count="exact", head=True)  # only returns row counts and no row data
        .eq("fuel_type", "electric")
        .is_("engine_size", "null")
        .execute()
    )

    print(f"\n  rows in table          {total.count:,} (expected {expected:,})")
    print(f"  electric, engine NULL  {electric.count:,}")

    if total.count != expected:
        print("  FAIL: row count mismatch", file=sys.stderr)
        raise SystemExit(1)
    if not electric.count:
        print("  FAIL: no electric rows with NULL engine_size", file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    rows = read_rows()
    print(f"Read {len(rows):,} rows from {CSV_PATH.name}")

    client = get_client()
    print(f"Seeding in batches of {BATCH_SIZE}")
    seed(client, rows)

    verify(client, len(rows))
    print("\nDone")


if __name__ == "__main__":
    main()
