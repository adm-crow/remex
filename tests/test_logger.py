import logging
import os

import pytest

from remex.core.logger import CustomFormatter, logger, setup_logging


@pytest.fixture(autouse=True)
def restore_logger_state():
    """Save and restore logger level and handlers around every test."""
    original_level = logger.level
    original_handlers = logger.handlers[:]
    yield
    # Close any handlers added during the test
    for handler in logger.handlers[:]:
        if handler not in original_handlers:
            handler.close()
    logger.handlers.clear()
    logger.handlers.extend(original_handlers)
    logger.setLevel(original_level)


# --- setup_logging ---

def test_setup_logging_sets_level():
    setup_logging(level=logging.DEBUG)
    assert logger.level == logging.DEBUG


def test_setup_logging_replaces_handlers():
    """Calling setup_logging twice must not accumulate handlers."""
    setup_logging()
    setup_logging()
    assert len(logger.handlers) == 1


def test_setup_logging_adds_file_handler(tmp_path):
    log_file = str(tmp_path / "test.log")
    setup_logging(log_file=log_file)
    # When log_file is set the Rust launcher already redirects stderr to that
    # file, so only a FileHandler is added (no StreamHandler) to avoid duplicates.
    assert len(logger.handlers) == 1
    assert any(isinstance(h, logging.FileHandler) for h in logger.handlers)


def test_setup_logging_file_is_written(tmp_path):
    log_file = str(tmp_path / "out.log")
    setup_logging(log_file=log_file)
    logger.info("hello from test")
    # Flush and close the file handler explicitly before reading
    for handler in logger.handlers:
        handler.flush()
        if isinstance(handler, logging.FileHandler):
            handler.close()

    assert os.path.exists(log_file)
    with open(log_file, encoding="utf-8") as f:
        content = f.read()
    assert "hello from test" in content


# --- CustomFormatter ---

def test_custom_formatter_covers_all_levels():
    formatter = CustomFormatter()
    for level in (logging.DEBUG, logging.INFO, logging.WARNING, logging.ERROR, logging.CRITICAL):
        record = logging.LogRecord(
            name="remex.core",
            level=level,
            pathname="",
            lineno=0,
            msg="msg",
            args=(),
            exc_info=None,
        )
        result = formatter.format(record)
        assert "msg" in result
