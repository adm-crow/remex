import sqlite3
from fastapi import APIRouter, HTTPException, Query
from remex.core import collection_stats, delete_source, list_collections, purge, reset, sources
from remex.core.exceptions import CollectionNotFoundError, RemexError
from remex.api.schemas import (
    CollectionStatsResponse,
    DeletedChunksResponse,
    DeletedResponse,
    PurgeResultResponse,
    SQLiteTablesResponse,
)

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("", response_model=list[str])
def get_collections(db_path: str = Query(default="./remex_db")) -> list[str]:
    return list_collections(db_path=db_path)


@router.get("/sqlite/tables", response_model=SQLiteTablesResponse)
def list_sqlite_tables(
    path: str = Query(..., description="Absolute path to the SQLite file"),
) -> SQLiteTablesResponse:
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row[0] for row in cursor.fetchall()]
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read SQLite file: {e}")
    return SQLiteTablesResponse(tables=tables)


@router.get("/{collection}/stats", response_model=CollectionStatsResponse)
def get_stats(
    collection: str, db_path: str = Query(default="./remex_db")
) -> CollectionStatsResponse:
    try:
        stats = collection_stats(db_path=db_path, collection_name=collection)
    except CollectionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return CollectionStatsResponse(
        name=stats.name,
        total_chunks=stats.total_chunks,
        total_sources=stats.total_sources,
        embedding_model=stats.embedding_model,
    )


@router.get("/{collection}/sources", response_model=list[str])
def get_sources(
    collection: str, db_path: str = Query(default="./remex_db")
) -> list[str]:
    return sources(db_path=db_path, collection_name=collection)


@router.delete("/{collection}/sources/{source:path}", response_model=DeletedChunksResponse)
def remove_source(
    collection: str, source: str, db_path: str = Query(default="./remex_db")
) -> DeletedChunksResponse:
    try:
        deleted = delete_source(source=source, db_path=db_path, collection_name=collection)
    except RemexError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return DeletedChunksResponse(deleted_chunks=deleted)


@router.delete("/{collection}", response_model=DeletedResponse)
def reset_collection(
    collection: str, db_path: str = Query(default="./remex_db")
) -> DeletedResponse:
    try:
        reset(db_path=db_path, collection_name=collection, confirm=True)
    except RemexError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return DeletedResponse(deleted=True)


@router.post("/{collection}/purge", response_model=PurgeResultResponse)
def purge_collection(
    collection: str, db_path: str = Query(default="./remex_db")
) -> PurgeResultResponse:
    result = purge(db_path=db_path, collection_name=collection)
    return PurgeResultResponse(
        chunks_deleted=result.chunks_deleted,
        chunks_checked=result.chunks_checked,
    )
