import asyncio
import json
import threading
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from remex.core import ingest, ingest_sqlite
from remex.core.exceptions import RemexError
from remex.core.models import IngestProgress
from remex.api.schemas import IngestRequest, IngestResultResponse, IngestSQLiteRequest

router = APIRouter(prefix="/collections", tags=["ingest"])


@router.post("/{collection}/ingest", response_model=IngestResultResponse)
async def ingest_files(collection: str, req: IngestRequest) -> IngestResultResponse:
    """Ingest files from a directory. Blocks until complete."""
    try:
        result = await asyncio.to_thread(
            ingest,
            source_dir=req.source_dir,
            db_path=req.db_path,
            collection_name=collection,
            chunk_size=req.chunk_size,
            overlap=req.overlap,
            min_chunk_size=req.min_chunk_size,
            incremental=req.incremental,
            chunking=req.chunking,
            streaming_threshold=req.streaming_threshold_mb * 1024 * 1024,
            embedding_model=req.embedding_model,
        )
    except (RemexError, FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return IngestResultResponse(
        sources_found=result.sources_found,
        sources_ingested=result.sources_ingested,
        sources_skipped=result.sources_skipped,
        chunks_stored=result.chunks_stored,
        skipped_reasons=result.skipped_reasons,
    )


@router.post("/{collection}/ingest/stream")
async def ingest_files_stream(collection: str, req: IngestRequest, request: Request) -> StreamingResponse:
    """SSE endpoint — streams per-file progress events, then a final result event.

    Event types:
      data: {"type": "progress", "filename": ..., "files_done": ..., ...}
      data: {"type": "done",     "result": {...}}
      data: {"type": "error",    "detail": "..."}
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict] = asyncio.Queue()
    cancel_event = threading.Event()

    def _on_progress(p: IngestProgress) -> None:
        # Raise immediately if the client disconnected — stops the ingest thread.
        if cancel_event.is_set():
            raise InterruptedError("Ingest cancelled by client")
        loop.call_soon_threadsafe(
            queue.put_nowait,
            {
                "type": "progress",
                "filename": p.filename,
                "files_done": p.files_done,
                "files_total": p.files_total,
                "status": p.status,
                "chunks_stored": p.chunks_stored,
            },
        )

    async def _run() -> None:
        try:
            result = await asyncio.to_thread(
                ingest,
                source_dir=req.source_dir,
                db_path=req.db_path,
                collection_name=collection,
                chunk_size=req.chunk_size,
                overlap=req.overlap,
                min_chunk_size=req.min_chunk_size,
                incremental=req.incremental,
                chunking=req.chunking,
                streaming_threshold=req.streaming_threshold_mb * 1024 * 1024,
                embedding_model=req.embedding_model,
                on_progress=_on_progress,
            )
            # Yield to the event loop so any call_soon_threadsafe callbacks
            # (progress events) queued from the thread are processed before done.
            await asyncio.sleep(0)
            await queue.put({
                "type": "done",
                "result": {
                    "sources_found": result.sources_found,
                    "sources_ingested": result.sources_ingested,
                    "sources_skipped": result.sources_skipped,
                    "chunks_stored": result.chunks_stored,
                    "skipped_reasons": result.skipped_reasons,
                },
            })
        except InterruptedError:
            pass  # Client disconnected — stream generator already exited.
        except (RemexError, FileNotFoundError, ValueError) as e:
            await queue.put({"type": "error", "detail": str(e)})
        except Exception as e:  # noqa: BLE001
            await queue.put({"type": "error", "detail": f"Unexpected error: {e}"})

    async def _monitor_disconnect() -> None:
        """Polls every 100 ms and sets cancel_event the moment the client drops.

        Running this as a separate task means we detect disconnect immediately
        even when the queue is being drained at full speed (e.g. many SQLite
        rows) and the stream loop never hits its wait_for timeout.
        """
        while True:
            if await request.is_disconnected():
                cancel_event.set()
                return
            await asyncio.sleep(0.1)

    async def _stream() -> AsyncIterator[str]:
        # Create tasks inside the generator so they are only started when the
        # response is actually consumed — prevents background task leaks if the
        # ASGI layer raises before the first iteration.
        task    = asyncio.create_task(_run())
        monitor = asyncio.create_task(_monitor_disconnect())
        idle_ticks = 0
        try:
            while True:
                try:
                    # Keep a generous timeout so the loop stays alive while the
                    # ingest is running but the queue is momentarily empty (e.g.
                    # embedding a large file).  The disconnect monitor handles
                    # cancellation independently, so no need for a tight timeout.
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                    idle_ticks = 0
                except asyncio.TimeoutError:
                    if cancel_event.is_set():
                        break
                    # Emit a heartbeat comment every 10 s so the client-side idle
                    # timer does not fire while a large model is loading.
                    idle_ticks += 1
                    if idle_ticks % 10 == 0:
                        yield ": heartbeat\n\n"
                    continue

                yield f"data: {json.dumps(event)}\n\n"
                # Yield to the event loop so uvicorn can flush this chunk before
                # processing the next event.
                await asyncio.sleep(0)
                if event["type"] in ("done", "error"):
                    break
        finally:
            # Always cancel the monitor and signal the thread, whether the run
            # finished normally, the client disconnected, or we hit an error.
            cancel_event.set()
            monitor.cancel()
            if not task.done():
                task.cancel()

    return StreamingResponse(_stream(), media_type="text/event-stream")


@router.post("/{collection}/ingest/sqlite", response_model=IngestResultResponse)
async def ingest_sqlite_table(
    collection: str, req: IngestSQLiteRequest
) -> IngestResultResponse:
    """Ingest rows from a SQLite table. Blocks until complete."""
    try:
        result = await asyncio.to_thread(
            ingest_sqlite,
            db_path=req.sqlite_path,
            table=req.table,
            columns=req.columns,
            id_column=req.id_column,
            row_template=req.row_template,
            chroma_path=req.db_path,
            collection_name=collection,
            chunk_size=req.chunk_size,
            overlap=req.overlap,
            min_chunk_size=req.min_chunk_size,
            chunking=req.chunking,
            embedding_model=req.embedding_model,
            incremental=req.incremental,
        )
    except (RemexError, FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return IngestResultResponse(
        sources_found=result.sources_found,
        sources_ingested=result.sources_ingested,
        sources_skipped=result.sources_skipped,
        chunks_stored=result.chunks_stored,
        skipped_reasons=result.skipped_reasons,
    )


@router.post("/{collection}/ingest/sqlite/stream")
async def ingest_sqlite_stream(
    collection: str, req: IngestSQLiteRequest, request: Request
) -> StreamingResponse:
    """SSE endpoint — streams per-row progress events, then a final result event.

    Event types:
      data: {"type": "progress", "filename": ..., "files_done": ..., "files_total": ..., ...}
      data: {"type": "done",     "result": {...}}
      data: {"type": "error",    "detail": "..."}
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict] = asyncio.Queue()
    cancel_event = threading.Event()

    def _on_progress(p: IngestProgress) -> None:
        if cancel_event.is_set():
            raise InterruptedError("Ingest cancelled by client")
        loop.call_soon_threadsafe(
            queue.put_nowait,
            {
                "type": "progress",
                "filename": p.filename,
                "files_done": p.files_done,
                "files_total": p.files_total,
                "status": p.status,
                "chunks_stored": p.chunks_stored,
            },
        )

    async def _run() -> None:
        try:
            result = await asyncio.to_thread(
                ingest_sqlite,
                db_path=req.sqlite_path,
                table=req.table,
                columns=req.columns,
                id_column=req.id_column,
                row_template=req.row_template,
                chroma_path=req.db_path,
                collection_name=collection,
                chunk_size=req.chunk_size,
                overlap=req.overlap,
                min_chunk_size=req.min_chunk_size,
                chunking=req.chunking,
                embedding_model=req.embedding_model,
                incremental=req.incremental,
                on_progress=_on_progress,
            )
            # Yield to the event loop so any call_soon_threadsafe callbacks
            # (progress events) queued from the thread are processed before done.
            await asyncio.sleep(0)
            await queue.put({
                "type": "done",
                "result": {
                    "sources_found": result.sources_found,
                    "sources_ingested": result.sources_ingested,
                    "sources_skipped": result.sources_skipped,
                    "chunks_stored": result.chunks_stored,
                    "skipped_reasons": result.skipped_reasons,
                },
            })
        except InterruptedError:
            pass  # Client disconnected — stream generator already exited.
        except (RemexError, FileNotFoundError, ValueError) as e:
            await queue.put({"type": "error", "detail": str(e)})
        except Exception as e:  # noqa: BLE001
            await queue.put({"type": "error", "detail": f"Unexpected error: {e}"})

    async def _monitor_disconnect() -> None:
        while True:
            if await request.is_disconnected():
                cancel_event.set()
                return
            await asyncio.sleep(0.1)

    async def _stream() -> AsyncIterator[str]:
        task    = asyncio.create_task(_run())
        monitor = asyncio.create_task(_monitor_disconnect())
        idle_ticks = 0
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                    idle_ticks = 0
                except asyncio.TimeoutError:
                    if cancel_event.is_set():
                        break
                    idle_ticks += 1
                    if idle_ticks % 10 == 0:
                        yield ": heartbeat\n\n"
                    continue

                yield f"data: {json.dumps(event)}\n\n"
                await asyncio.sleep(0)
                if event["type"] in ("done", "error"):
                    break
        finally:
            cancel_event.set()
            monitor.cancel()
            if not task.done():
                task.cancel()

    return StreamingResponse(_stream(), media_type="text/event-stream")
