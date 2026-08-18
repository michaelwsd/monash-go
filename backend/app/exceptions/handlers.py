"""Translates domain errors into HTTP responses.

The only place that knows a NotFoundError is a 404. One handler registered for
the DomainError base class covers every subclass automatically, including the
ones added in later sprints.
"""

from typing import cast

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.exceptions.errors import DomainError


async def domain_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    called when an unknown error (that inherits DomainError) is raised and nothing
    catches it in the service or route
    Starlette catches it at the app boundary and calls this handler
    """
    error = cast(
        DomainError, exc
    )  # prevent mypy errors, Exception doesn't have status code and detail
    return JSONResponse(status_code=error.status_code, content={"detail": error.detail})


def register_exception_handlers(app: FastAPI) -> None:
    """attach the handler to an app. called from main.py and from tests"""
    """ 
    this puts DomainError -> domain_error_handler
    
    when any exception escapes a route, starlette walks that exception's inheritance chain 
    looking for a match in the table

    a NotFoundError finds DomainError, so your handler is called with the exception, reads 
    its status_code and detail, and returns a JSONResponse which Starlette sends to the client.
    """
    app.add_exception_handler(DomainError, domain_error_handler)
