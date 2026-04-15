import {
  useQuery,
  useMutation,
  useQueryClient,
  useQueries,
} from "@tanstack/react-query";
import { api, type QueryResultItem, type SourceItem } from "@/api/client";

export type { SourceItem };

export function useCollections(apiUrl: string, dbPath: string) {
  return useQuery({
    queryKey: ["collections", apiUrl, dbPath],
    queryFn: () => api.getCollections(apiUrl, dbPath),
    enabled: !!apiUrl && !!dbPath,
  });
}

export function useCollectionStats(
  apiUrl: string,
  dbPath: string,
  collection: string
) {
  return useQuery({
    queryKey: ["collectionStats", apiUrl, dbPath, collection],
    queryFn: () => api.getCollectionStats(apiUrl, dbPath, collection),
    enabled: !!apiUrl && !!dbPath && !!collection,
  });
}

export function useSources(
  apiUrl: string,
  dbPath: string,
  collection: string
) {
  return useQuery({
    queryKey: ["sources", apiUrl, dbPath, collection],
    queryFn: () => api.getSources(apiUrl, dbPath, collection),
    enabled: !!apiUrl && !!dbPath && !!collection,
  });
}

export interface QueryOptions {
  enabled?: boolean;
  n_results?: number;
  min_score?: number;
  where?: Record<string, unknown>;
}

export interface ChatOptions extends QueryOptions {
  provider?: string;
  model?: string;
  api_key?: string;
}

export function useMultiQueryResults(
  apiUrl: string,
  dbPath: string,
  collections: string[],
  text: string,
  options?: QueryOptions
): { data: QueryResultItem[]; isLoading: boolean; error: Error | null } {
  const results = useQueries({
    queries: collections.map((col) => ({
      queryKey: [
        "query", apiUrl, dbPath, col, text,
        options?.n_results, options?.min_score, options?.where,
      ],
      queryFn: () =>
        api.queryCollection(apiUrl, dbPath, col, {
          text,
          n_results: options?.n_results,
          min_score: options?.min_score,
          where: options?.where,
        }),
      enabled:
        !!apiUrl && !!text && !!dbPath && !!col && (options?.enabled ?? true),
    })),
  });

  return {
    data: results
      .flatMap((r) => r.data ?? [])
      .sort((a, b) => b.score - a.score),
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error ?? null, // first error wins; others are dropped
  };
}

export function useChat(
  apiUrl: string,
  dbPath: string,
  collection: string,
  text: string,
  options?: ChatOptions
) {
  return useQuery({
    queryKey: [
      "chat",
      apiUrl,
      dbPath,
      collection,
      text,
      options?.provider,
      options?.model,
      options?.api_key,
    ],
    queryFn: () =>
      api.chat(apiUrl, dbPath, collection, {
        text,
        n_results: options?.n_results,
        min_score: options?.min_score,
        provider: options?.provider || undefined,
        model: options?.model || undefined,
        api_key: options?.api_key || undefined,
      }),
    enabled:
      !!apiUrl &&
      !!text &&
      !!dbPath &&
      !!collection &&
      (options?.enabled ?? true),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useMultiChat(
  apiUrl: string,
  dbPath: string,
  collections: string[],
  text: string,
  options?: ChatOptions
) {
  return useQuery({
    queryKey: [
      "multiChat", apiUrl, dbPath,
      JSON.stringify(collections.slice().sort()), // stable key regardless of order
      text,
      options?.provider, options?.model,
    ],
    queryFn: () =>
      api.multiChat(apiUrl, dbPath, {
        text,
        collections,
        n_results: options?.n_results,
        min_score: options?.min_score,
        provider: options?.provider || undefined,
        model: options?.model || undefined,
        api_key: options?.api_key || undefined,
      }),
    enabled:
      !!apiUrl && !!text && !!dbPath && collections.length > 0 && (options?.enabled ?? true),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useDeleteSource(
  apiUrl: string,
  dbPath: string,
  collection: string
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (source: string) =>
      api.deleteSource(apiUrl, dbPath, collection, source),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sources", apiUrl, dbPath, collection],
      });
      queryClient.invalidateQueries({
        queryKey: ["collectionStats", apiUrl, dbPath, collection],
      });
    },
  });
}

export function useDeleteCollection(
  apiUrl: string,
  dbPath: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collection: string) =>
      api.resetCollection(apiUrl, dbPath, collection),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["collections", apiUrl, dbPath],
      });
    },
  });
}

export function useRenameCollection(apiUrl: string, dbPath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ collection, newName }: { collection: string; newName: string }) =>
      api.renameCollection(apiUrl, dbPath, collection, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections", apiUrl, dbPath] });
    },
  });
}

export function usePurgeCollection(
  apiUrl: string,
  dbPath: string,
  collection: string
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.purgeCollection(apiUrl, dbPath, collection),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sources", apiUrl, dbPath, collection],
      });
      queryClient.invalidateQueries({
        queryKey: ["collectionStats", apiUrl, dbPath, collection],
      });
    },
  });
}
