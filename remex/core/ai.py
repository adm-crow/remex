"""Provider-agnostic LLM answer generation for the CLI --ai flag."""

import json
import os
import threading
import time as _time
import urllib.error
import urllib.request
from typing import Optional

PROVIDERS = ("anthropic", "openai", "ollama", "custom")

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
_ollama_cache_lock = threading.Lock()
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
    with _ollama_cache_lock:
        if _ollama_cache is not None and now - _ollama_cache[0] < _OLLAMA_CACHE_TTL:
            return _ollama_cache[1]
    try:
        req = urllib.request.Request(f"{_ollama_base()}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=2):
            result = True
    except (urllib.error.URLError, OSError):
        result = False
    with _ollama_cache_lock:
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
    system_prompt: Optional[str] = None,
    # Custom-provider config — only used when provider == "custom". These come
    # from the Studio "Custom providers" card and let the user point Remex at
    # any OpenAI-Chat-Completions-compatible endpoint (corporate AI gateway,
    # Azure OpenAI, LiteLLM proxy, vLLM, etc.).
    base_url: Optional[str] = None,
    header_name: Optional[str] = None,
    header_prefix: Optional[str] = None,
) -> str:
    """Generate an answer using the specified provider and model."""
    model = model or DEFAULT_MODELS.get(provider, "")
    base = _SYSTEM_PROMPT.format(context=context)
    system = f"{system_prompt.strip()}\n\n{base}" if system_prompt and system_prompt.strip() else base

    if provider == "anthropic":
        return _answer_anthropic(question, system, model, api_key=api_key)
    if provider == "openai":
        return _answer_openai(question, system, model, api_key=api_key)
    if provider == "ollama":
        return _answer_ollama(question, system, model)
    if provider == "custom":
        if not base_url:
            raise ValueError("Custom provider requires a base_url (Settings → AI → Custom providers).")
        if not model:
            raise ValueError("Custom provider requires a model name.")
        return _answer_custom_openai(
            question, system, model,
            base_url=base_url,
            api_key=api_key,
            header_name=header_name or "Authorization",
            header_prefix=header_prefix if header_prefix is not None else "Bearer ",
        )

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


# ── Custom OpenAI-compatible providers ───────────────────────────────────────


def _custom_request(
    url: str,
    *,
    api_key: Optional[str],
    header_name: str,
    header_prefix: str,
    body: Optional[bytes] = None,
    timeout: float = 60.0,
) -> urllib.request.Request:
    """Build a Request object with the custom-provider auth header attached."""
    headers: dict[str, str] = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if api_key:
        headers[header_name] = f"{header_prefix}{api_key}"
    method = "POST" if body is not None else "GET"
    return urllib.request.Request(url, data=body, headers=headers, method=method)


def _answer_custom_openai(
    question: str,
    system: str,
    model: str,
    *,
    base_url: str,
    api_key: Optional[str],
    header_name: str,
    header_prefix: str,
) -> str:
    """POST to ``{base_url}/chat/completions`` using the OpenAI message schema."""
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": question},
        ],
    }).encode()
    req = _custom_request(
        url, api_key=api_key,
        header_name=header_name, header_prefix=header_prefix,
        body=payload,
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        raise RuntimeError(f"Custom provider HTTP {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Custom provider unreachable: {e.reason}") from e
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError(f"Unexpected custom-provider response shape: {str(data)[:200]}")


def list_custom_provider_models(
    *,
    base_url: str,
    api_key: Optional[str] = None,
    header_name: str = "Authorization",
    header_prefix: str = "Bearer ",
    timeout: float = 10.0,
) -> list[str]:
    """GET ``{base_url}/models`` and return the sorted unique model IDs.

    Raises ``RuntimeError`` with a single-line diagnostic on any failure so the
    "Test connection" button can surface a readable message.
    """
    url = f"{base_url.rstrip('/')}/models"
    req = _custom_request(
        url, api_key=api_key,
        header_name=header_name, header_prefix=header_prefix,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {e.reason}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Unreachable: {e.reason}") from e
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Non-JSON response: {e}") from e

    # OpenAI shape: {"data": [{"id": "model-name", ...}, ...]}
    # Some gateways return a bare list — handle both.
    items = data.get("data", data) if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise RuntimeError(f"Unexpected /models shape: {str(data)[:200]}")
    ids = {
        item["id"] for item in items
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    return sorted(ids)
