import logging
import os

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

from remex.core import __version__
from remex.api.routes import collections, ingest, query, system

_logger = logging.getLogger(__name__)

# Tauri webview origins — localhost:1420 in dev, tauri://localhost in production
_ALLOWED_ORIGINS = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
    "https://tauri.localhost",
]


class _EnvTrustedHostMiddleware:
    """Host-header allow-list from ``REMEX_ALLOWED_HOSTS`` (DNS-rebinding
    protection — see bootstrap.restrict_hosts_for_loopback). No-op when unset.

    Read per request, not at build time: the module-level ``app`` is created
    when ``remex.api`` is first imported, before ``remex serve`` /
    ``python -m remex.api`` know which interface they bind to.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._configured: str | None = None
        self._inner: ASGIApp = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        allowed = os.environ.get("REMEX_ALLOWED_HOSTS", "")
        if allowed != self._configured:
            hosts = [h.strip() for h in allowed.split(",") if h.strip()]
            self._inner = TrustedHostMiddleware(self.app, allowed_hosts=hosts) if hosts else self.app
            self._configured = allowed
        await self._inner(scope, receive, send)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Remex API",
        version=__version__,
        description="Local-first RAG API — powered by remex.core",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_ALLOWED_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(_EnvTrustedHostMiddleware)

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> Response:
        """Catch-all: routes through FastAPI's HTTPException handler so that
        CORSMiddleware can attach Access-Control-Allow-Origin to error responses.
        Full detail is logged server-side only — the response never leaks
        internal paths, API keys, or stack content.

        HTTPException (and its `RequestValidationError`/422 family) must pass
        through to FastAPI's normal handlers so 4xx responses keep their
        original status code and detail body; otherwise this would mask every
        validation error as a generic 500.
        """
        if isinstance(exc, FastAPIHTTPException):
            return await http_exception_handler(request, exc)
        _logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        return await http_exception_handler(
            request,
            FastAPIHTTPException(status_code=500, detail="An internal error occurred."),
        )

    app.include_router(system.router)
    app.include_router(collections.router)
    app.include_router(ingest.router)
    app.include_router(query.router)

    return app


app = create_app()
