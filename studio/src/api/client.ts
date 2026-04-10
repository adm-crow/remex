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
}

export interface IngestRequest {
  source_dir: string;
  embedding_model?: string;
  chunk_size?: number;
  overlap?: number;
  min_chunk_size?: number;
  chunking?: "word" | "sentence";
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

export type IngestStreamEvent =
  | IngestProgressEvent
  | IngestDoneEvent
  | IngestErrorEvent;

// ---- Internal fetch helper ----

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = init !== undefined ? await fetch(url, init) : await fetch(url);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
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

  getSources: (base: string, dbPath: string, collection: string) =>
    apiFetch<string[]>(
      `${base}/collections/${encodeURIComponent(collection)}/sources?db_path=${encodeURIComponent(dbPath)}`
    ),

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

  async *ingestFilesStream(
    base: string,
    dbPath: string,
    collection: string,
    req: IngestRequest,
    signal?: AbortSignal
  ): AsyncGenerator<IngestStreamEvent> {
    const res = await fetch(
      `${base}/collections/${encodeURIComponent(collection)}/ingest/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, db_path: dbPath }),
        signal,
      }
    );
    if (!res.ok || !res.body) {
      throw new Error(`${res.status}: ingest stream failed`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (part.startsWith("data: ")) {
          yield JSON.parse(part.slice(6)) as IngestStreamEvent;
        }
      }
    }
  },
};
