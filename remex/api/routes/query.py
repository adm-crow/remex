import asyncio

from fastapi import APIRouter, HTTPException

from remex.core import DEFAULT_MODELS, detect_provider, generate_answer, query
from remex.core.exceptions import RemexError
from remex.api.schemas import ChatRequest, ChatResponse, QueryRequest, QueryResultItem, MultiChatRequest, MultiChatResponse

router = APIRouter(prefix="/collections", tags=["query"])


@router.post("/{collection}/query", response_model=list[QueryResultItem])
async def query_collection(
    collection: str, req: QueryRequest
) -> list[QueryResultItem]:
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

    provider = req.provider or await asyncio.to_thread(detect_provider)
    if not provider:
        raise HTTPException(
            status_code=422,
            detail="No AI provider detected. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
        )

    resolved_model = req.model or DEFAULT_MODELS.get(provider, "")
    context = "\n\n".join(r["text"] for r in results)

    try:
        answer = await asyncio.to_thread(
            generate_answer,
            question=req.text,
            context=context,
            provider=provider,
            model=resolved_model,
            api_key=req.api_key if req.api_key else None,
        )
    except (ValueError, ImportError) as e:
        # Missing API key, unknown provider, or SDK not installed — user config error.
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        # Downstream API error (auth failure, rate limit, network, etc.).
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return ChatResponse(
        answer=answer,
        sources=list(results),
        provider=provider,
        model=resolved_model,
    )


@router.post("/multi-chat", response_model=MultiChatResponse)
async def multi_chat(req: MultiChatRequest) -> MultiChatResponse:
    """Query multiple collections, merge top results by score, generate AI answer."""
    all_results: list[dict] = []

    for collection_name in req.collections:
        try:
            results = await asyncio.to_thread(
                query,
                text=req.text,
                db_path=req.db_path,
                collection_name=collection_name,
                n_results=req.n_results,
                where=req.where,
                embedding_model=req.embedding_model,
                min_score=req.min_score,
            )
            all_results.extend(list(results))
        except (RemexError, ValueError):
            pass  # skip missing/empty collections silently

    # Sort merged results by score descending, keep top n_results overall
    all_results.sort(key=lambda r: r["score"], reverse=True)
    merged = all_results[:req.n_results]

    if not merged:
        raise HTTPException(
            status_code=404,
            detail="No relevant chunks found across the selected collections.",
        )

    provider = req.provider or await asyncio.to_thread(detect_provider)
    if not provider:
        raise HTTPException(
            status_code=422,
            detail="No AI provider detected. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
        )

    resolved_model = req.model or DEFAULT_MODELS.get(provider, "")
    context = "\n\n".join(r["text"] for r in merged)

    try:
        answer = await asyncio.to_thread(
            generate_answer,
            question=req.text,
            context=context,
            provider=provider,
            model=resolved_model,
            api_key=req.api_key if req.api_key else None,
        )
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return MultiChatResponse(
        answer=answer,
        sources=list(merged),
        provider=provider,
        model=resolved_model,
        collections=req.collections,
    )
