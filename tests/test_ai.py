"""Tests for the Anthropic answer path in remex.core.ai (SDK faked — no network)."""

import sys
import types
from types import SimpleNamespace

import pytest

from remex.core import ai


@pytest.fixture
def fake_anthropic(monkeypatch):
    """Install a minimal fake `anthropic` module; returns the captured create() kwargs."""
    calls: dict = {}
    response_holder: dict = {}

    class APIError(Exception):
        pass

    class APIStatusError(APIError):
        status_code = 500
        message = "boom"

    class _Messages:
        def create(self, **kwargs):
            calls.update(kwargs)
            return response_holder["response"]

    class Anthropic:
        def __init__(self, api_key=None):
            self.messages = _Messages()

    mod = types.ModuleType("anthropic")
    mod.Anthropic = Anthropic
    mod.APIError = APIError
    mod.APIStatusError = APIStatusError
    monkeypatch.setitem(sys.modules, "anthropic", mod)

    def respond(content, stop_reason="end_turn", stop_details=None):
        response_holder["response"] = SimpleNamespace(
            content=content, stop_reason=stop_reason, stop_details=stop_details,
        )

    return calls, respond


def _block(type_, **fields):
    return SimpleNamespace(type=type_, **fields)


def test_default_anthropic_model_is_current_sonnet():
    assert ai.DEFAULT_MODELS["anthropic"] == "claude-sonnet-5-5"


def test_skips_thinking_blocks_and_returns_text(fake_anthropic):
    calls, respond = fake_anthropic
    respond([_block("thinking", thinking=""), _block("text", text="Refunds within 30 days.")])

    answer = ai.generate_answer("q?", "ctx", provider="anthropic", api_key="k")

    assert answer == "Refunds within 30 days."
    assert calls["model"] == "claude-sonnet-5-5"


def test_max_tokens_leaves_room_for_adaptive_thinking(fake_anthropic):
    """Current models think by default and thinking shares max_tokens with the
    answer — 1024 could be consumed before any text was written."""
    calls, respond = fake_anthropic
    respond([_block("text", text="ok")])

    ai.generate_answer("q?", "ctx", provider="anthropic", api_key="k")

    assert calls["max_tokens"] >= 16000


def test_refusal_is_reported_as_such(fake_anthropic):
    _, respond = fake_anthropic
    respond([], stop_reason="refusal", stop_details=SimpleNamespace(category="cyber", explanation="x"))

    with pytest.raises(RuntimeError, match=r"declined.*cyber"):
        ai.generate_answer("q?", "ctx", provider="anthropic", api_key="k")
