import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/api/client";

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
}

export interface ChatOptions extends QueryOptions {
  provider?: string;
  model?: string;
  api_key?: string;
}

export function useQueryResults(
  apiUrl: string,
  dbPath: string,
  collection: string,
  text: string,
  options?: QueryOptions
) {
  return useQuery({
    queryKey: [
      "query",
      apiUrl,
      dbPath,
      collection,
      text,
      options?.n_results,
      options?.min_score,
    ],
    queryFn: () =>
      api.queryCollection(apiUrl, dbPath, collection, {
        text,
        n_results: options?.n_results,
        min_score: options?.min_score,
      }),
    enabled:
      !!apiUrl &&
      !!text &&
      !!dbPath &&
      !!collection &&
      (options?.enabled ?? true),
  });
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
    },
  });
}
