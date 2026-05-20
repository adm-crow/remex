import { fetch } from "@tauri-apps/plugin-http";
import { errMsg } from "@/lib/utils";

// ---- Types (mirror FastAPI schemas in remex/api/schemas.py) ----

export interface HealthResponse {
  status: string;
  version: string;
}

export interface CollectionStatsResponse {
  name: string;
  total_chunks: number;
  total_sources: number;
  embedding_model: string;
  description: string;
}

export interface PurgeResultResponse {
  chunks_deleted: number;
  chunks_checked: number;
}

export interface DeletedChunksResponse {
  deleted_chunks: number;
}

export interface QueryResultItem {
  text: string;
  source: string;
  source_type: string;
  score: number;
  distance: number;
  chunk: number;
  doc_title: string;
  doc_author: string;
  doc_created: string;
}

export interface ChatResponse {
  answer: string;
  sources: QueryResultItem[];
  provider: string;
  model: string;
}

export interface MultiChatResponse {
  answer: string;
  sources: QueryResultItem[];
  provider: string;
  model: string;
  collections: string[];
}

export interface QueryRequest {
  text: string;
  n_results?: number;
  embedding_model?: string;
  where?: Record<string, unknown>;
  min_score?: number;
}

export interface ChatRequest extends QueryRequest {
  provider?: string;
  model?: string;
  api_key?: string;
  system_prompt?: string;
  // Custom-provider config — only sent when provider === "custom".
  base_url?: string;
  header_name?: string;
  header_prefix?: string;
}

export interface TestCustomProviderResponse {
  models: string[];
}

export interface IngestRequest {
  source_dir: string;
  embedding_model?: string;
  chunk_size?: number;
  overlap?: number;
  min_chunk_size?: number;
  chunking?: "word" | "sentence" | "recursive";
  incremental?: boolean;
  streaming_threshold_mb?: number;
}

export interface IngestResultResponse {
  sources_found: number;
  sources_ingested: number;
  sources_skipped: number;
  chunks_stored: number;
  skipped_reasons: string[];
}

export interface SQLiteTablesResponse {
  tables: string[];
}

export interface SourceItem {
  source: string;
  chunk_count: number;
}

export interface IngestSQLiteRequest {
  sqlite_path: string;
  table: string;
  embedding_model?: string;
  chunk_size?: number;
  overlap?: number;
  min_chunk_size?: number;
  chunking?: "word" | "sentence" | "recursive";
  columns?: string[];
  id_column?: string;
  row_template?: string;
  incremental?: boolean;
}

export interface IngestProgressEvent {
  type: "progress";
  filename: string;
  files_done: number;
  files_total: number;
  status: "ingested" | "skipped" | "error";
  chunks_stored: number;
}

export interface IngestDoneEvent {
  type: "done";
  result: IngestResultResponse;
}

export interface IngestErrorEvent {
  type: "error";
  detail: string;
}

export interface ModelDownloadEvent {
  type: "model_download";
  downloaded_bytes: number;
  total_bytes: number;
}

export type IngestStreamEvent =
  | IngestProgressEvent
  | IngestDoneEvent
  | IngestErrorEvent
  | ModelDownloadEvent;

// ---- SSE stream helpers ----

const SSE_IDLE_TIMEOUT_MS = 60_000; // abort SSE stream after 60 s with no events

/**
 * Consume an SSE `ReadableStream` and yield parsed `IngestStreamEvent` objects.
 * Aborts if no data arrives for `SSE_IDLE_TIMEOUT_MS` milliseconds.
 */
async function* readSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<IngestStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const abort = new AbortController();
  if (signal) signal.addEventListener("abort", () => abort.abort(signal.reason), { once: true });

  const resetIdle = () => {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => abort.abort(new Error("SSE idle timeout")), SSE_IDLE_TIMEOUT_MS);
  };

  const abortPromise = new Promise<never>((_, reject) => {
    abort.signal.addEventListener("abort", () => reject(abort.signal.reason), { once: true });
  });

  try {
    resetIdle();
    outer: while (true) {
      if (abort.signal.aborted) throw abort.signal.reason;
      const { done, value } = await Promise.race([reader.read(), abortPromise]);
      if (done) break;
      resetIdle();
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (part.startsWith("data: ")) {
          let event: IngestStreamEvent;
          try {
            event = JSON.parse(part.slice(6)) as IngestStreamEvent;
          } catch {
            continue;
          }
          yield event;
          if (event.type === "done" || event.type === "error") break outer;
        }
      }
    }
  } finally {
    if (idleTimer !== null) clearTimeout(idleTimer);
    reader.cancel().catch(() => {});
  }
}

// ---- Internal fetch helper ----

// On Windows, "localhost" may resolve to ::1 (IPv6) while the sidecar binds to
// 127.0.0.1 (IPv4), causing "Failed to fetch". Always use the explicit IPv4 address.
function normalizeBase(base: string): string {
  // Replace localhost regardless of whether an explicit port is present.
  return base.replace(/^(https?:\/\/)localhost(:\d+|\/|$)/, "$1127.0.0.1$2");
}

/**
 * Turn a FastAPI/Pydantic error body into a readable single-line string.
 *
 * Two shapes are common:
 *   • Application errors raised via `HTTPException(detail="…")` —
 *     body is `{"detail": "…"}` with `detail` being a string.
 *   • Pydantic validation errors —
 *     body is `{"detail": [{"loc": [...], "msg": "…", "type": "…"}, …]}`
 *     with `detail` being an **array**. Naively coercing the array to a string
 *     produces "[object Object]" — useless. We extract `msg` from each entry
 *     and join them.
 */
function formatErrorBody(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "object" && parsed !== null && "detail" in parsed) {
      const detail = (parsed as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) {
        const parts = detail.map((d) => {
          if (typeof d === "string") return d;
          if (typeof d === "object" && d !== null) {
            const obj = d as { msg?: unknown; loc?: unknown };
            const msg = typeof obj.msg === "string" ? obj.msg : JSON.stringify(d);
            const loc = Array.isArray(obj.loc) ? obj.loc.filter((x) => x !== "body").join(".") : "";
            return loc ? `${loc}: ${msg}` : msg;
          }
          return JSON.stringify(d);
        });
        return parts.join("; ");
      }
      return JSON.stringify(detail);
    }
  } catch {
    // body wasn't JSON
  }
  return body;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const resolvedUrl = normalizeBase(url);
  let res: Response;
  try {
    res = await (init !== undefined ? fetch(resolvedUrl, init) : fetch(resolvedUrl));
  } catch (e) {
    throw new Error(
      `Cannot reach the server at ${resolvedUrl.replace(/\/[^/]+$/, "")}. ` +
      `Make sure 'remex serve' is running. (${errMsg(e)})`
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${formatErrorBody(body)}`);
  }
  return res.json() as Promise<T>;
}

// ---- Public API ----

export const api = {
  getHealth: (base: string) =>
    apiFetch<HealthResponse>(`${base}/health`),

  getCollections: (base: string, dbPath: string) =>
    apiFetch<string[]>(
      `${base}/collections?db_path=${encodeURIComponent(dbPath)}`
    ),

  getCollectionStats: (base: string, dbPath: string, collection: string) =>
    apiFetch<CollectionStatsResponse>(
      `${base}/collections/${encodeURIComponent(collection)}/stats?db_path=${encodeURIComponent(dbPath)}`
    ),

  getSources: async (base: string, dbPath: string, collection: string) => {
    const raw = await apiFetch<SourceItem[] | string[]>(
      `${base}/collections/${encodeURIComponent(collection)}/sources?db_path=${encodeURIComponent(dbPath)}`
    );
    // Normalise: handle servers that still return plain string[].
    return (raw as Array<SourceItem | string>).map((item): SourceItem =>
      typeof item === "string" ? { source: item, chunk_count: 0 } : item
    );
  },

  deleteSource: (
    base: string,
    dbPath: string,
    collection: string,
    source: string
  ) =>
    apiFetch<DeletedChunksResponse>(
      `${base}/collections/${encodeURIComponent(collection)}/sources/${encodeURIComponent(source)}?db_path=${encodeURIComponent(dbPath)}`,
      { method: "DELETE" }
    ),

  resetCollection: (base: string, dbPath: string, collection: string) =>
    apiFetch<{ deleted: boolean }>(
      `${base}/collections/${encodeURIComponent(collection)}?db_path=${encodeURIComponent(dbPath)}`,
      { method: "DELETE" }
    ),

  purgeCollection: (base: string, dbPath: string, collection: string) =>
    apiFetch<PurgeResultResponse>(
      `${base}/collections/${encodeURIComponent(collection)}/purge?db_path=${encodeURIComponent(dbPath)}`,
      { method: "POST" }
    ),

  queryCollection: (
    base: string,
    dbPath: string,
    collection: string,
    req: QueryRequest
  ) =>
    apiFetch<QueryResultItem[]>(
      `${base}/collections/${encodeURIComponent(collection)}/query`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, db_path: dbPath }),
      }
    ),

  chat: (
    base: string,
    dbPath: string,
    collection: string,
    req: ChatRequest
  ) =>
    apiFetch<ChatResponse>(
      `${base}/collections/${encodeURIComponent(collection)}/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, db_path: dbPath }),
      }
    ),

  multiChat: (
    base: string,
    dbPath: string,
    req: ChatRequest & { collections: string[] }
  ) =>
    apiFetch<MultiChatResponse>(
      `${base}/collections/multi-chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, db_path: dbPath }),
      }
    ),

  ingestFiles: (
    base: string,
    dbPath: string,
    collection: string,
    req: IngestRequest
  ) =>
    apiFetch<IngestResultResponse>(
      `${base}/collections/${encodeURIComponent(collection)}/ingest`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, db_path: dbPath }),
      }
    ),

  listSqliteTables: (base: string, sqlitePath: string) =>
    apiFetch<SQLiteTablesResponse>(
      `${base}/collections/sqlite/tables?path=${encodeURIComponent(sqlitePath)}`
    ),

  ingestSqlite: (
    base: string,
    dbPath: string,
    collection: string,
    req: IngestSQLiteRequest
  ) =>
    apiFetch<IngestResultResponse>(
      `${base}/collections/${encodeURIComponent(collection)}/ingest/sqlite`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, db_path: dbPath }),
      }
    ),

  async *ingestSqliteStream(
    base: string,
    dbPath: string,
    collection: string,
    req: IngestSQLiteRequest,
    signal?: AbortSignal
  ): AsyncGenerator<IngestStreamEvent> {
    const resolvedBase = normalizeBase(base);
    let res: Response;
    try {
      res = await fetch(
        `${resolvedBase}/collections/${encodeURIComponent(collection)}/ingest/sqlite/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...req, db_path: dbPath }),
          signal,
        }
      );
    } catch (e) {
      throw new Error(
        `Cannot reach the server at ${resolvedBase}. Make sure 'remex serve' is running. ` +
        `(${errMsg(e)})`
      );
    }
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status}: ${formatErrorBody(body) || "sqlite ingest stream failed"}`);
    }
    yield* readSseStream(res.body, signal);
  },

  updateCollectionDescription: (
    base: string,
    dbPath: string,
    collection: string,
    description: string,
  ): Promise<CollectionStatsResponse> => {
    const url = new URL(`${base}/collections/${encodeURIComponent(collection)}/description`);
    url.searchParams.set("db_path", dbPath);
    return apiFetch<CollectionStatsResponse>(
      url.toString(),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      }
    );
  },

  renameCollection: (
    base: string,
    dbPath: string,
    collection: string,
    newName: string,
  ): Promise<{ renamed: boolean; old_name: string; new_name: string }> => {
    const url = new URL(`${base}/collections/${encodeURIComponent(collection)}/rename`);
    url.searchParams.set("db_path", dbPath);
    return apiFetch<{ renamed: boolean; old_name: string; new_name: string }>(
      url.toString(),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: newName }),
      }
    );
  },

  warmupModels: (base: string, dbPath: string) =>
    apiFetch<{ status: string }>(
      `${base}/collections/warmup?db_path=${encodeURIComponent(dbPath)}`,
      { method: "POST" }
    ),

  /** Probe an OpenAI-compatible custom provider and return its available models.
   *  Used by the "Test connection" button in Settings → AI → Custom providers. */
  testCustomProvider: (
    base: string,
    req: {
      base_url: string;
      api_key?: string;
      header_name?: string;
      header_prefix?: string;
    },
  ) =>
    apiFetch<TestCustomProviderResponse>(
      `${base}/system/test-custom-provider`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      }
    ),

  async *ingestFilesStream(
    base: string,
    dbPath: string,
    collection: string,
    req: IngestRequest,
    signal?: AbortSignal
  ): AsyncGenerator<IngestStreamEvent> {
    const resolvedBase = normalizeBase(base);
    let res: Response;
    try {
      res = await fetch(
        `${resolvedBase}/collections/${encodeURIComponent(collection)}/ingest/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...req, db_path: dbPath }),
          signal,
        }
      );
    } catch (e) {
      throw new Error(
        `Cannot reach the server at ${resolvedBase}. Make sure 'remex serve' is running. ` +
        `(${errMsg(e)})`
      );
    }
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status}: ${formatErrorBody(body) || "ingest stream failed"}`);
    }
    yield* readSseStream(res.body, signal);
  },
};
