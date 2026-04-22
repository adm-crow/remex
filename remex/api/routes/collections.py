import os
import sqlite3
from fastapi import APIRouter, HTTPException, Query
from remex.core import collection_stats, delete_source, list_collections, purge, reset, source_chunk_counts, update_collection_description
from remex.core.exceptions import CollectionNotFoundError, RemexError
from remex.core.pipeline import _get_client
from remex.api.schemas import (
    CollectionStatsResponse,
    DeletedChunksResponse,
    DeletedResponse,
    PurgeResultResponse,
    SQLiteTablesResponse,
    SourceItem,
    RenameRequest,
    RenamedResponse,
    UpdateDescriptionRequest,
)

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("", response_model=list[str])
def get_collections(db_path: str = Query(default="./remex_db")) -> list[str]:
    return list_collections(db_path=db_path)


@router.get("/sqlite/tables", response_model=SQLiteTablesResponse)
def list_sqlite_tables(
    path: str = Query(..., description="Absolute path to the SQLite file"),
) -> SQLiteTablesResponse:
    if not os.path.isabs(path):
        raise HTTPException(status_code=400, detail="Path must be absolute")
    if not os.path.isfile(path):
        raise HTTPException(status_code=400, detail="File does not exist")
    conn = None
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row[0] for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read SQLite file: {e}")
    finally:
        if conn:
            conn.close()
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
        description=stats.description,
    )


@router.patch("/{collection}/description", response_model=CollectionStatsResponse)
def set_description(
    collection: str,
    req: UpdateDescriptionRequest,
    db_path: str = Query(default="./remex_db"),
) -> CollectionStatsResponse:
    try:
        update_collection_description(
            db_path=db_path,
            collection_name=collection,
            description=req.description,
        )
        stats = collection_stats(db_path=db_path, collection_name=collection)
    except CollectionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return CollectionStatsResponse(
        name=stats.name,
        total_chunks=stats.total_chunks,
        total_sources=stats.total_sources,
        embedding_model=stats.embedding_model,
        description=stats.description,
    )


@router.get("/{collection}/sources", response_model=list[SourceItem])
def get_sources(
    collection: str, db_path: str = Query(default="./remex_db")
) -> list[SourceItem]:
    try:
        counts = source_chunk_counts(db_path=db_path, collection_name=collection)
    except CollectionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return [
        SourceItem(source=src, chunk_count=count)
        for src, count in sorted(counts.items())
    ]


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
    try:
        collection_stats(db_path=db_path, collection_name=collection)
    except CollectionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    result = purge(db_path=db_path, collection_name=collection)
    return PurgeResultResponse(
        chunks_deleted=result.chunks_deleted,
        chunks_checked=result.chunks_checked,
    )


@router.patch("/{collection}/rename", response_model=RenamedResponse)
def rename_collection(
    collection: str,
    req: RenameRequest,
    db_path: str = Query(default="./remex_db"),
) -> RenamedResponse:
    """Rename a ChromaDB collection via a sentinel-copy pattern.

    Steps:
      1. Copy all data into a sentinel collection (``__rename_tmp__{old}``)
      2. Verify chunk count matches before touching the original
      3. Delete the original
      4. Create the new collection from the sentinel
      5. Delete the sentinel

    If the process is interrupted after step 2, both the original and the
    sentinel survive — no data is lost.  On the next request the stale sentinel
    is cleaned up automatically.
    """
    client = _get_client(db_path)
    try:
        old_col = client.get_collection(collection)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")

    existing = [c.name for c in client.list_collections()]
    if req.new_name in existing:
        raise HTTPException(status_code=409, detail=f"Collection '{req.new_name}' already exists")

    sentinel_name = f"remextmp.{collection}"[:512]
    # Clean up any stale sentinel from a previous interrupted rename.
    if sentinel_name in existing:
        try:
            client.delete_collection(sentinel_name)
        except Exception:
            pass

    original_count = old_col.count()
    if original_count > 100_000:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Collection has {original_count:,} chunks — too large to rename in-memory "
                "(limit: 100,000). Use the CLI to reset and re-ingest under the new name."
            ),
        )

    all_data = old_col.get(include=["documents", "metadatas", "embeddings"])

    # Step 1-2: Copy to sentinel and verify
    sentinel = client.create_collection(sentinel_name, metadata=old_col.metadata or {})
    if original_count:
        sentinel.upsert(
            ids=all_data["ids"],
            documents=all_data["documents"],
            metadatas=all_data["metadatas"],
            embeddings=all_data["embeddings"],
        )
    if sentinel.count() != original_count:
        client.delete_collection(sentinel_name)
        raise HTTPException(status_code=500, detail="Rename aborted: sentinel copy count mismatch")

    # Step 3-5: Swap names — original is only deleted after copy is verified
    try:
        client.delete_collection(collection)
        new_col = client.create_collection(req.new_name, metadata=old_col.metadata or {})
        if original_count:
            sentinel_data = sentinel.get(include=["documents", "metadatas", "embeddings"])
            new_col.upsert(
                ids=sentinel_data["ids"],
                documents=sentinel_data["documents"],
                metadatas=sentinel_data["metadatas"],
                embeddings=sentinel_data["embeddings"],
            )
        client.delete_collection(sentinel_name)
    except Exception as e:
        try:
            client.delete_collection(req.new_name)
        except Exception:
            pass
        raise HTTPException(
            status_code=500,
            detail=f"Rename failed mid-swap: {e}. Your data is safe in sentinel '{sentinel_name}'.",
        )
    return RenamedResponse(renamed=True, old_name=collection, new_name=req.new_name)
