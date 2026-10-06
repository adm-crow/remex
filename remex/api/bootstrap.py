"""Sidecar startup helpers shared between the CLI ``serve`` command and ``python -m remex.api``.

Both entrypoints must call :func:`bootstrap_sidecar` before starting uvicorn so that
corporate SSL proxies are trusted and the bundled ONNX model is staged.
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path

logger = logging.getLogger("remex.core")


def _inject_truststore() -> None:
    """Trust the OS native certificate store so corporate SSL-inspection proxies work.

    A failure here (e.g. Windows group policy blocking keystore access) must not
    take the sidecar down — the user can still reach plain-HTTP endpoints and the
    error is surfaced at WARNING level.
    """
    try:
        import truststore
    except ImportError:
        return
    try:
        truststore.inject_into_ssl()
    except Exception as exc:
        logger.warning("truststore inject failed (%s); falling back to bundled CA bundle.", exc)


def _seed_bundled_model() -> None:
    """Copy the bundled ONNX model into the ChromaDB cache on first launch.

    Failures here would cause the user's first embedding call to download the model
    from the network, so they are surfaced at WARNING level rather than swallowed.
    """
    bundled = os.environ.get("REMEX_BUNDLED_ONNX_PATH")
    if not bundled:
        return
    dest = Path.home() / ".cache" / "chroma" / "onnx_models" / "all-MiniLM-L6-v2" / "onnx"
    if dest.exists():
        return
    try:
        dest.mkdir(parents=True, exist_ok=True)
        for f in Path(bundled).iterdir():
            if f.is_file():
                shutil.copy2(f, dest / f.name)
    except Exception as exc:
        logger.warning("Bundled ONNX seed failed (%s); model will be downloaded on first use.", exc)


def restrict_hosts_for_loopback(host: str) -> None:
    """Only answer requests addressed to a loopback name when bound to loopback.

    Binding to 127.0.0.1 alone does not stop a web page from reaching the
    sidecar through DNS rebinding (attacker.example re-resolving to 127.0.0.1),
    and this API can read and index arbitrary local folders. ``create_app``
    rejects any other Host header once ``REMEX_ALLOWED_HOSTS`` is set. A sidecar
    deliberately exposed on another interface is left unrestricted, and an
    explicit ``REMEX_ALLOWED_HOSTS`` always wins.
    """
    if host in ("127.0.0.1", "localhost"):
        os.environ.setdefault("REMEX_ALLOWED_HOSTS", "127.0.0.1,localhost")


def bootstrap_sidecar() -> None:
    """Run once before uvicorn starts. Idempotent."""
    _inject_truststore()
    _seed_bundled_model()
