import logging
import os

import pytest

import synapse_core
from synapse_core.logger import CustomFormatter, logger, setup_logging


# --- logger baseline ---

def test_logger_name():
    assert logger.name == "synapse_core"


def test_logger_does_not_propagate():
    """Must not propagate to root logger to avoid duplicate output."""
    assert logger.propagate is False


def test_logger_default_level():
    assert logger.level == logging.INFO


def test_logger_has_default_handler():
    assert len(logger.handlers) >= 1


# --- setup_logging ---

def test_setup_logging_sets_level():
    setup_logging(level=logging.DEBUG)
    assert logger.level == logging.DEBUG
    setup_logging()  # restore default


def test_setup_logging_replaces_handlers():
    """Calling setup_logging twice must not accumulate handlers."""
    setup_logging()
    setup_logging()
    assert len(logger.handlers) == 1


def test_setup_logging_adds_file_handler(tmp_path):
    log_file = str(tmp_path / "test.log")
    setup_logging(log_file=log_file)
    assert len(logger.handlers) == 2
    setup_logging()  # restore to console-only


def test_setup_logging_file_is_written(tmp_path):
    log_file = str(tmp_path / "out.log")
    setup_logging(log_file=log_file)
    logger.info("hello from test")
    setup_logging()  # close file handler before reading

    assert os.path.exists(log_file)
    content = open(log_file, encoding="utf-8").read()
    assert "hello from test" in content


def test_setup_logging_exported_from_package():
    assert hasattr(synapse_core, "setup_logging")
    assert callable(synapse_core.setup_logging)


# --- CustomFormatter ---

def test_custom_formatter_returns_string():
    formatter = CustomFormatter()
    record = logging.LogRecord(
        name="synapse_core",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg="test message",
        args=(),
        exc_info=None,
    )
    result = formatter.format(record)
    assert "test message" in result


def test_custom_formatter_covers_all_levels():
    formatter = CustomFormatter()
    for level in (logging.DEBUG, logging.INFO, logging.WARNING, logging.ERROR, logging.CRITICAL):
        record = logging.LogRecord(
            name="synapse_core",
            level=level,
            pathname="",
            lineno=0,
            msg="msg",
            args=(),
            exc_info=None,
        )
        result = formatter.format(record)
        assert "msg" in result
