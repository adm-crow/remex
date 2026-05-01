"""Provider-agnostic LLM answer generation for the CLI --ai flag."""

import json
import os
import time as _time
import urllib.error
import urllib.request
from typing import Optional

PROVIDERS = ("anthropic", "openai", "ollama")

DEFAULT_MODELS: dict[str, str] = {
    "anthropic": "claude-sonnet-4-5",
    "openai": "gpt-4o",
    "ollama": "llama3",
}

_SYSTEM_PROMPT = (
    "You are a helpful assistant. "
    "Answer the user's question using ONLY the context provided below. "
    "Be concise and direct. "
    "If the answer is not in the context, say so clearly.\n\n"
    "CONTEXT:\n{context}"
)

_ollama_cache: tuple[float, bool] | None = None
_OLLAMA_CACHE_TTL = 30.0  # seconds


def _ollama_base() -> str:
    """Return the Ollama base URL, respecting OLLAMA_HOST if set."""
    host = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
    if not host.startswith(("http://", "https://")):
        host = f"http://{host}"
    return host


def _ollama_available() -> bool:
    """Check whether Ollama is running locally, with a 30-second cache."""
    global _ollama_cache
    now = _time.monotonic()
    if _ollama_cache is not None and now - _ollama_cache[0] < _OLLAMA_CACHE_TTL:
        return _ollama_cache[1]
    try:
        req = urllib.request.Request(f"{_ollama_base()}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=2):
            result = True
    except (urllib.error.URLError, OSError):
        result = False
    _ollama_cache = (now, result)
    return result


def detect_provider() -> Optional[str]:
    """Return the first available provider based on env vars / local services."""
    if os.getenv("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    if _ollama_available():
        return "ollama"
    return None


def generate_answer(
    question: str,
    context: str,
    provider: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> str:
    """Generate an answer using the specified provider and model."""
    model = model or DEFAULT_MODELS.get(provider, "")
    system = _SYSTEM_PROMPT.format(context=context)

    if provider == "anthropic":
        return _answer_anthropic(question, system, model, api_key=api_key)
    if provider == "openai":
        return _answer_openai(question, system, model, api_key=api_key)
    if provider == "ollama":
        return _answer_ollama(question, system, model)

    raise ValueError(
        f"Unknown provider '{provider}'. Choose from: {', '.join(PROVIDERS)}"
    )


# ── providers ────────────────────────────────────────────────────────────────


def _answer_anthropic(
    question: str, system: str, model: str, api_key: Optional[str] = None
) -> str:
    try:
        import anthropic  # type: ignore[import-untyped]
        from anthropic.types import TextBlock  # type: ignore[import-untyped]
    except ImportError:
        raise ImportError("Anthropic SDK not installed. Run: pip install anthropic")
    key = api_key or os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise ValueError(
            "No Anthropic API key provided. Add one in Settings → AI Agent or set ANTHROPIC_API_KEY."
        )
    client = anthropic.Anthropic(api_key=key)
    try:
        response = client.messages.create(
            model=model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": question}],
        )
    except Exception as e:
        raise RuntimeError(f"Anthropic API error: {e}") from e
    text_block = next((b for b in response.content if isinstance(b, TextBlock)), None)
    if text_block is None:
        raise RuntimeError("Anthropic response contained no text block.")
    return text_block.text


def _answer_openai(
    question: str, system: str, model: str, api_key: Optional[str] = None
) -> str:
    try:
        import openai  # type: ignore[import-untyped]
    except ImportError:
        raise ImportError("OpenAI SDK not installed. Run: pip install openai")
    key = api_key or os.getenv("OPENAI_API_KEY")
    if not key:
        raise ValueError(
            "No OpenAI API key provided. Add one in Settings → AI Agent or set OPENAI_API_KEY."
        )
    client = openai.OpenAI(api_key=key)
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": question},
            ],
        )
    except Exception as e:
        raise RuntimeError(f"OpenAI API error: {e}") from e
    return response.choices[0].message.content or ""


def _answer_ollama(question: str, system: str, model: str) -> str:
    payload = json.dumps(
        {
            "model": model,
            "prompt": f"{system}\n\nQuestion: {question}",
            "stream": False,
        }
    ).encode()
    req = urllib.request.Request(
        f"{_ollama_base()}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
    except urllib.error.URLError as e:
        raise RuntimeError(f"Ollama request failed: {e}. Is 'ollama serve' running?")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Ollama returned invalid JSON: {e}")
    try:
        return data["response"]
    except KeyError:
        raise RuntimeError(f"Unexpected Ollama response format: {data}")
