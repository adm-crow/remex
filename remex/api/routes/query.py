import asyncio

from fastapi import APIRouter, HTTPException

from remex.core import DEFAULT_MODELS, detect_provider, generate_answer, query
from remex.core.exceptions import SynapseError
from remex.api.schemas import ChatRequest, ChatResponse, QueryRequest, QueryResultItem

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
    except (SynapseError, ValueError) as e:
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
    except (SynapseError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not results:
        raise HTTPException(status_code=404, detail="No relevant chunks found in this collection.")

    provider = req.provider or detect_provider()
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
        )
    except (ImportError, RuntimeError, ValueError) as e:
        raise HTTPException(status_code=500, detail=str(e))

    return ChatResponse(
        answer=answer,
        sources=list(results),
        provider=provider,
        model=resolved_model,
    )
