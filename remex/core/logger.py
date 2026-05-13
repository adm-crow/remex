import logging
import sys
from typing import Optional


class CustomFormatter(logging.Formatter):
    white = "\x1b[37m"
    blue = "\x1b[34m"
    yellow = "\x1b[33m"
    red = "\x1b[31m"
    bold_red = "\x1b[1;31m"
    reset = "\x1b[0m"

    _fmt = "%(asctime)s - %(levelname)s : %(message)s"
    _datefmt = "%Y-%m-%d %H:%M:%S"

    FORMATS = {
        logging.DEBUG: (white + _fmt + reset, _datefmt),
        logging.INFO: (blue + _fmt + reset, _datefmt),
        logging.WARNING: (yellow + _fmt + reset, _datefmt),
        logging.ERROR: (red + _fmt + reset, _datefmt),
        logging.CRITICAL: (bold_red + _fmt + reset, _datefmt),
    }

    def format(self, record: logging.LogRecord) -> str:
        log_fmt, date_fmt = self.FORMATS.get(record.levelno, (self._fmt, self._datefmt))
        return logging.Formatter(log_fmt, date_fmt).format(record)


logger = logging.getLogger("remex.core")
logger.setLevel(logging.INFO)
logger.propagate = False  # prevent double output when the root logger has handlers


def setup_logging(
    level: int = logging.INFO,
    log_file: Optional[str] = None,
) -> None:
    """Configure remex.core logging. Call once at startup."""
    logger.setLevel(level)
    for handler in logger.handlers[:]:
        handler.close()
    logger.handlers.clear()

    if log_file:
        # When a dedicated log file is set (Tauri sidecar), write directly to it.
        # Stderr is already redirected to the same file by the Rust launcher, so
        # skipping the StreamHandler here prevents every line appearing twice.
        fh = logging.FileHandler(log_file, encoding="utf-8")
        fh.setLevel(level)
        fh.setFormatter(logging.Formatter(
            "%(asctime)s - %(levelname)s : %(message)s",
            "%Y-%m-%d %H:%M:%S",
        ))
        logger.addHandler(fh)
    else:
        # Console handler (stderr) for CLI / library usage.
        ch = logging.StreamHandler(sys.stderr)
        ch.setLevel(level)
        ch.setFormatter(CustomFormatter())
        logger.addHandler(ch)
