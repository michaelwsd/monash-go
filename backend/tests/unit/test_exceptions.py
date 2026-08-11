import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.exceptions.errors import DomainError, NotFoundError, PermissionDeniedError
from app.exceptions.handlers import register_exception_handlers


# fixtures run before a test, so client is created
# pytest sees a parameter called client and finds this fixture
@pytest.fixture
def client() -> TestClient:
    """
    A throwaway API whose only purpose is to raise the errors and returns a client that can call it
    """
    app = FastAPI()
    # attaches handler to this app
    register_exception_handlers(app)

    @app.get("/domain")
    def raise_domain() -> None:
        raise DomainError("something went wrong")

    @app.get("/not-found")
    def raise_not_found() -> None:
        raise NotFoundError("ride not found")

    @app.get("/forbidden")
    def raise_forbidden() -> None:
        raise PermissionDeniedError("not your booking")

    return TestClient(app, raise_server_exceptions=False)  # the object each test receives as client


def test_not_found_maps_to_404(client: TestClient) -> None:
    response = client.get("/not-found")

    assert response.status_code == 404
    assert response.json() == {"detail": "ride not found"}


def test_permission_denied_maps_to_403(client: TestClient) -> None:
    response = client.get("/forbidden")

    assert response.status_code == 403
    assert response.json() == {"detail": "not your booking"}


def test_domain_error_is_handled_not_crashed(client: TestClient) -> None:
    response = client.get("/domain")

    assert response.status_code == 500
    # A crash returns the plain string "Internal Server Error"; only a
    # registered handler produces this JSON body.
    assert response.json() == {"detail": "something went wrong"}
