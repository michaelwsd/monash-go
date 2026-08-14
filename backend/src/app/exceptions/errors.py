"""Domain errors.

Services raise these, never HTTPException, so business logic stays usable
outside a web request (seed scripts, scheduled jobs) and testable without
FastAPI.

Each subclass declares the HTTP status it maps to. The handler reads that
attribute, so adding a new error type is one class here and no change to
handlers.py.
"""


class DomainError(Exception):
    """
    A business rule was violated.

    Raised directly only when no more specific subclass applies, which is why
    it defaults to 500
    """

    status_code: int = 500

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(DomainError):
    """resource does not exist or caller may not know it does"""

    status_code = 404


class PermissionDeniedError(DomainError):
    """caller is authenticated but not allowed to do this"""

    status_code = 403


class InvalidCredentialsError(DomainError):
    """token is missing, malformed, expired, or not signed by Clerk"""

    status_code = 401
