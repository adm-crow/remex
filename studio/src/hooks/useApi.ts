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
    enabled: !!dbPath,
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
    enabled: !!dbPath && !!collection,
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
    enabled: !!dbPath && !!collection,
  });
}

export function useQueryResults(
  apiUrl: string,
  dbPath: string,
  collection: string,
  text: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["query", apiUrl, dbPath, collection, text],
    queryFn: () => api.queryCollection(apiUrl, dbPath, collection, { text }),
    enabled:
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
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["chat", apiUrl, dbPath, collection, text],
    queryFn: () => api.chat(apiUrl, dbPath, collection, { text }),
    enabled:
      !!text &&
      !!dbPath &&
      !!collection &&
      (options?.enabled ?? true),
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
