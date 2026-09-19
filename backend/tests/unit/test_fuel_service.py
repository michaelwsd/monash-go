"""Fuel prices at the service layer: a writer and a reader that never meet.

This is not Sprint 3's route cache, and the tests are shaped to stop it
becoming one. A route is fetched lazily when a request misses; a fuel price is
written by a scheduled job and only ever read on a request path. Servo Saver
allows ten requests a minute, and a price that could move mid-session would let
two identical comparisons disagree.

So the reader gets a client that explodes if touched, and the writer is the
only thing that goes near the network.
"""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import httpx
import pytest

from app.exceptions.errors import NotFoundError, UpstreamServiceError
from app.schemas.enums import FuelType
from app.schemas.fuel import FuelPrice
from app.services import fuel_service
from supabase import Client

# the fakes never touch it, so there is nothing real to pass
DB = cast(Client, None)

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "servo_saver" / "prices.json"


class ExplodingClient:
    """Stands in for the http client on the READ path. Any attribute access
    - .get, .post, anything - is a test failure, because the read path must
    never make a request."""

    def __getattr__(self, name: str) -> Any:
        raise AssertionError(f"the read path touched the http client: .{name}")


class FakeServo:
    """Stands in for app.clients.servo_saver on the WRITE path. Answers with
    the recorded fixture, or raises, and counts how often it was asked."""

    def __init__(self, *, fails: bool = False) -> None:
        self.fails = fails
        self.calls = 0

    def fetch_prices(self, client: object) -> dict[str, Any]:
        self.calls += 1
        if self.fails:
            raise UpstreamServiceError("servo saver api error")
        payload: dict[str, Any] = json.loads(FIXTURE.read_text())
        return payload


class FakeFuelRepo:
    """An in-memory fuel_prices table. Rows are appended, never replaced, the
    way the real table keeps every day's fetch."""

    def __init__(self, rows: list[FuelPrice] | None = None) -> None:
        self.rows = list(rows or [])

    def insert(self, db: object, *, fuel_type: FuelType, price_per_litre: float) -> FuelPrice:
        row = FuelPrice(
            id=uuid4(),
            fuel_type=fuel_type,
            price_per_litre=price_per_litre,
            fetched_at=datetime.now(UTC),
        )
        self.rows.append(row)
        return row

    def latest(self, db: object, *, fuel_type: FuelType) -> FuelPrice | None:
        matching = [row for row in self.rows if row.fuel_type == fuel_type]
        return max(matching, key=lambda row: row.fetched_at, default=None)


def price_row(fuel_type: FuelType, price: float, *, age: timedelta) -> FuelPrice:
    return FuelPrice(
        id=uuid4(),
        fuel_type=fuel_type,
        price_per_litre=price,
        fetched_at=datetime.now(UTC) - age,
    )


def install(
    monkeypatch: pytest.MonkeyPatch,
    *,
    rows: list[FuelPrice] | None = None,
    fails: bool = False,
) -> tuple[FakeFuelRepo, FakeServo]:
    repo = FakeFuelRepo(rows)
    servo = FakeServo(fails=fails)
    monkeypatch.setattr(fuel_service, "fuel_repository", repo)
    monkeypatch.setattr(fuel_service, "servo_saver", servo)
    return repo, servo


# --- the read path -------------------------------------------------------


def test_latest_price_never_calls_the_api(monkeypatch: pytest.MonkeyPatch) -> None:
    """The assertion this file exists for. Ten requests a minute is the whole
    quota; a request path that could trigger a fetch would spend it on one
    busy morning."""
    _, servo = install(monkeypatch, rows=[price_row("petrol", 2.159, age=timedelta(hours=3))])

    price = fuel_service.latest_price(DB, fuel_type="petrol")

    assert price == pytest.approx(2.159)
    assert servo.calls == 0


def test_latest_price_reads_only_the_repository(monkeypatch: pytest.MonkeyPatch) -> None:
    """Belt and braces on the test above: latest_price has no http argument at
    all, so there is no client for it to misuse. This pins the signature."""
    install(monkeypatch, rows=[price_row("diesel", 2.499, age=timedelta(hours=1))])

    assert fuel_service.latest_price(DB, fuel_type="diesel") == pytest.approx(2.499)


def test_the_newest_row_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every day's fetch is kept. Yesterday's row is history, not a fallback
    the reader might pick by accident."""
    install(
        monkeypatch,
        rows=[
            price_row("petrol", 2.159, age=timedelta(days=2)),
            price_row("petrol", 2.299, age=timedelta(hours=6)),
            price_row("petrol", 2.209, age=timedelta(days=1)),
        ],
    )

    assert fuel_service.latest_price(DB, fuel_type="petrol") == pytest.approx(2.299)


def test_fuel_types_do_not_bleed_into_each_other(monkeypatch: pytest.MonkeyPatch) -> None:
    install(
        monkeypatch,
        rows=[
            price_row("diesel", 2.779, age=timedelta(hours=1)),
            price_row("petrol", 2.299, age=timedelta(hours=2)),
        ],
    )

    assert fuel_service.latest_price(DB, fuel_type="petrol") == pytest.approx(2.299)
    assert fuel_service.latest_price(DB, fuel_type="diesel") == pytest.approx(2.779)


def test_an_empty_table_is_a_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    """No price is not a price of zero, and not a made-up default either. The
    compare service decides what to show; this must not guess for it."""
    install(monkeypatch, rows=[])

    with pytest.raises(NotFoundError):
        fuel_service.latest_price(DB, fuel_type="petrol")


def test_electric_is_never_a_fuel_price(monkeypatch: pytest.MonkeyPatch) -> None:
    """EVs are costed on ELECTRICITY_PRICE from constants. Asking this table
    for one is a caller bug, and the honest answer is that there is no row."""
    install(monkeypatch, rows=[price_row("petrol", 2.299, age=timedelta(hours=1))])

    with pytest.raises(NotFoundError):
        fuel_service.latest_price(DB, fuel_type="electric")


# --- the write path ------------------------------------------------------


def test_fetch_and_store_writes_one_row_per_fuel_type(monkeypatch: pytest.MonkeyPatch) -> None:
    """The real transform runs on the recorded fixture, so the numbers stored
    are the ones test_fuel_transform.py already pinned."""
    repo, servo = install(monkeypatch)

    stored = fuel_service.fetch_and_store(DB, cast(httpx.Client, ExplodingClient()))

    assert servo.calls == 1
    assert {row.fuel_type for row in repo.rows} == {"petrol", "diesel", "hybrid"}
    assert stored["petrol"] == pytest.approx(2.159)
    assert repo.latest(DB, fuel_type="diesel") is not None
    assert repo.latest(DB, fuel_type="diesel").price_per_litre == pytest.approx(2.499)  # type: ignore[union-attr]


def test_fetch_and_store_appends_rather_than_overwrites(monkeypatch: pytest.MonkeyPatch) -> None:
    """The table is a history. Yesterday's row stays; the reader picks by
    fetched_at. Overwriting would lose the audit trail for free."""
    repo, _ = install(monkeypatch, rows=[price_row("petrol", 2.159, age=timedelta(days=1))])

    fuel_service.fetch_and_store(DB, cast(httpx.Client, ExplodingClient()))

    petrol_rows = [row for row in repo.rows if row.fuel_type == "petrol"]
    assert len(petrol_rows) == 2


def test_a_failed_fetch_writes_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Half a day's prices - petrol written, diesel not - would leave the two
    fuels a day apart. The error propagates so the job exits non-zero and
    yesterday's rows stay the newest for every fuel type."""
    repo, _ = install(monkeypatch, fails=True)

    with pytest.raises(UpstreamServiceError):
        fuel_service.fetch_and_store(DB, cast(httpx.Client, ExplodingClient()))

    assert repo.rows == []


def test_after_a_fetch_the_reader_sees_the_new_price(monkeypatch: pytest.MonkeyPatch) -> None:
    """The two halves, end to end at the service layer: what the writer stores
    is what the reader returns, with the stale row correctly beaten."""
    install(monkeypatch, rows=[price_row("petrol", 1.999, age=timedelta(days=1))])

    fuel_service.fetch_and_store(DB, cast(httpx.Client, ExplodingClient()))

    assert fuel_service.latest_price(DB, fuel_type="petrol") == pytest.approx(2.159)
