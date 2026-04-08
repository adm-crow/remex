"""Entry point for the Remex API sidecar.

Usage:
    python -m remex.api                  # default port 37421
    python -m remex.api --port 8000      # custom port

The Tauri sidecar launches this process and communicates via HTTP.
"""

import argparse

import uvicorn

from remex.api.main import app

_DEFAULT_PORT = 37421


def main() -> None:
    parser = argparse.ArgumentParser(description="Remex API sidecar")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=_DEFAULT_PORT)
    parser.add_argument("--reload", action="store_true", help="Dev mode auto-reload")
    args = parser.parse_args()

    uvicorn.run(
        "remex.api.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
