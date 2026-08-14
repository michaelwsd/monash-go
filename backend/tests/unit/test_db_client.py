"""Unit tests for the cached Supabase client.

No network: supabase.create_client is replaced with a recorder that returns a
dummy object, so these tests assert on wiring only.
"""

from collections.abc import Iterator
from typing import Any

import pytest

from app.db import client as db_client
from tests.conftest import fake_settings


class DummyClient:
    """Stand-in for supabase.Client. The tests never call its methods."""


@pytest.fixture(autouse=True)  # runs for every test in the file without being requested by name
def clear_client_cache() -> Iterator[None]:
    """A cache that survives between tests would hide a second test's calls."""
    db_client.get_supabase.cache_clear()
    yield
    db_client.get_supabase.cache_clear()


@pytest.fixture
def recorded_calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    calls: list[tuple[str, str]] = []

    def fake_create_client(url: str, key: str, *args: Any, **kwargs: Any) -> DummyClient:
        calls.append((url, key))
        return DummyClient()

    monkeypatch.setattr(db_client, "create_client", fake_create_client)
    monkeypatch.setattr(db_client, "get_settings", fake_settings)
    return calls


def test_get_supabase_returns_the_same_client(recorded_calls: list[tuple[str, str]]) -> None:
    first = db_client.get_supabase()
    second = db_client.get_supabase()

    assert first is second
    assert len(recorded_calls) == 1


def test_get_supabase_uses_settings_not_hardcoded_values(
    recorded_calls: list[tuple[str, str]],
) -> None:
    settings = fake_settings()

    db_client.get_supabase()

    assert recorded_calls == [(settings.supabase_url, settings.supabase_key.get_secret_value())]
