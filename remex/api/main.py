from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from remex.core import __version__
from remex.api.routes import collections, ingest, query, system

# Tauri webview origins — localhost:1420 in dev, tauri://localhost in production
_ALLOWED_ORIGINS = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
    "https://tauri.localhost",
]


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

    app.include_router(system.router)
    app.include_router(collections.router)
    app.include_router(ingest.router)
    app.include_router(query.router)

    return app


app = create_app()
