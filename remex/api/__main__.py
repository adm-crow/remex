"""Entry point for the Remex API sidecar.

Usage:
    python -m remex.api                  # default port 37421
    python -m remex.api --port 8000      # custom port

The Tauri sidecar launches this process and communicates via HTTP.
"""

import argparse
import logging
from pathlib import Path

import uvicorn

from remex.core.logger import setup_logging

_DEFAULT_PORT = 37421
_DEFAULT_LOG = Path.home() / ".remex" / "sidecar.log"


def main() -> None:
    parser = argparse.ArgumentParser(description="Remex API sidecar")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=_DEFAULT_PORT)
    parser.add_argument("--reload", action="store_true", help="Dev mode auto-reload")
    parser.add_argument(
        "--log-file",
        default=str(_DEFAULT_LOG),
        help=f"Path for the sidecar log file (default: {_DEFAULT_LOG})",
    )
    args = parser.parse_args()

    # Ensure the log directory exists before handing control to uvicorn.
    log_path = Path(args.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    setup_logging(level=logging.INFO, log_file=str(log_path))

    uvicorn.run(
        "remex.api.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
