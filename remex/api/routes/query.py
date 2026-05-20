import asyncio
import logging

from fastapi import APIRouter, HTTPException

from remex.core import DEFAULT_MODELS, detect_provider, generate_answer, query
from remex.core.exceptions import RemexError
from remex.api.schemas import (
    ChatRequest,
    ChatResponse,
    MultiChatRequest,
    MultiChatResponse,
    QueryRequest,
    QueryResultItem,
)

_logger = logging.getLogger("remex.core")

router = APIRouter(prefix="/collections", tags=["query"])

_NO_PROVIDER_DETAIL = (
    "No AI provider detected. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or start 'ollama serve'."
)


async def _generate_chat_response(
    results: list[dict],
    req: ChatRequest | MultiChatRequest,
    log_label: str,
) -> tuple[str, str, str]:
    """Resolve provider/model and call generate_answer in a thread.

    Returns ``(answer, provider, model)``. Raises ``HTTPException`` with the
    appropriate status code on user/provider errors so callers can re-raise.
    """
    provider = req.provider or await asyncio.to_thread(detect_provider)
    if not provider:
        raise HTTPException(status_code=422, detail=_NO_PROVIDER_DETAIL)

    resolved_model = req.model or DEFAULT_MODELS.get(provider, "")
    context = "\n\n".join(r["text"] for r in results)
    _logger.info("[%s] provider=%s model=%s q=%.120s", log_label, provider, resolved_model, req.text)

    try:
        answer = await asyncio.to_thread(
            generate_answer,
            question=req.text,
            context=context,
            provider=provider,
            model=resolved_model,
            api_key=req.api_key if req.api_key else None,
            system_prompt=req.system_prompt or None,
        )
    except (ValueError, ImportError) as e:
        # Missing API key, unknown provider, or SDK not installed — user config error.
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        # Downstream API error (auth failure, rate limit, network, etc.).
        _logger.warning("[%s] provider error: %s", log_label, e)
        raise HTTPException(status_code=502, detail=str(e))
    except Exception:
        _logger.exception("[%s] unexpected error during generate_answer", log_label)
        raise HTTPException(status_code=500, detail="An internal error occurred during AI generation.")

    return answer, provider, resolved_model


@router.post("/{collection}/query", response_model=list[QueryResultItem])
async def query_collection(
    collection: str, req: QueryRequest
) -> list:
    _logger.info("[QUERY] collection=%s n=%d q=%.120s", collection, req.n_results, req.text)
    try:
        results = await asyncio.to_thread(
            query,
            text=req.text,
            db_path=req.db_path,
            collection_name=collection,
            n_results=req.n_results,
            where=req.where,
            embedding_model=req.embedding_model,
            min_score=req.min_score,
        )
    except (RemexError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    _logger.info("[QUERY] -> %d results", len(results))
    return list(results)


@router.post("/{collection}/chat", response_model=ChatResponse)
async def chat(collection: str, req: ChatRequest) -> ChatResponse:
    try:
        results = await asyncio.to_thread(
            query,
            text=req.text,
            db_path=req.db_path,
            collection_name=collection,
            n_results=req.n_results,
            where=req.where,
            embedding_model=req.embedding_model,
            min_score=req.min_score,
        )
    except (RemexError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not results:
        raise HTTPException(status_code=404, detail="No relevant chunks found in this collection.")

    _logger.info("[CHAT] collection=%s q=%.120s", collection, req.text)
    answer, provider, resolved_model = await _generate_chat_response(
        list(results), req, log_label="CHAT"
    )

    return ChatResponse(
        answer=answer,
        sources=[QueryResultItem(**r) for r in results],
        provider=provider,
        model=resolved_model,
    )


@router.post("/multi-chat", response_model=MultiChatResponse)
async def multi_chat(req: MultiChatRequest) -> MultiChatResponse:
    """Query multiple collections, merge top results by score, generate AI answer.

    Delegates the cross-collection merge to ``core.query(collection_names=...)``,
    which already handles missing/empty collections silently.
    """
    try:
        merged = await asyncio.to_thread(
            query,
            text=req.text,
            db_path=req.db_path,
            collection_names=req.collections,
            n_results=req.n_results,
            where=req.where,
            embedding_model=req.embedding_model,
            min_score=req.min_score,
        )
    except (RemexError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not merged:
        raise HTTPException(
            status_code=404,
            detail="No relevant chunks found across the selected collections.",
        )

    _logger.info("[CHAT/MULTI] collections=%s q=%.120s", req.collections, req.text)
    answer, provider, resolved_model = await _generate_chat_response(
        list(merged), req, log_label="CHAT/MULTI"
    )

    return MultiChatResponse(
        answer=answer,
        sources=[QueryResultItem(**r) for r in merged],
        provider=provider,
        model=resolved_model,
        collections=req.collections,
    )
