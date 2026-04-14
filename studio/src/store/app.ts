import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentProject {
  path: string;
  lastOpened: string;
}

export type Theme = "default" | "blue" | "purple" | "green" | "rose" | "amber" | "teal" | "coral" | "slate" | "lime" | "violet" | "cyan";

export interface ProgressItem {
  filename: string;
  status: "ingested" | "skipped" | "error";
  chunks_stored: number;
}

export interface LastIngestResult {
  collection: string;
  sourcePath: string;
  startedAt: string;   // ISO string
  completedAt: string; // ISO string
  sourcesFound: number;
  sourcesIngested: number;
  sourcesSkipped: number;
  chunksStored: number;
}

export interface AppState {
  currentDb: string | null;
  currentCollection: string | null;
  recentProjects: RecentProject[];
  queryHistory: string[];
  apiUrl: string;
  sidecarStatus: "starting" | "connected" | "error";
  darkMode: boolean;
  theme: Theme;
  aiProvider: string;
  aiModel: string;
  aiApiKey: string;
  // Sidecar reconnect (not persisted)
  sidecarReconnectSeq: number;
  triggerSidecarReconnect: () => void;
  // Ingest session state (not persisted)
  ingestRunning: boolean;
  ingestProgress: ProgressItem[];
  ingestFilesDone: number;
  ingestFilesTotal: number;
  ingestStreamError: string | null;
  ingestDoneUnread: boolean;
  // Ingest result (persisted)
  lastIngestResult: LastIngestResult | null;
  // Collection metadata (persisted)
  collectionTypes: Record<string, "files" | "sqlite">;
  // Actions
  setCurrentDb: (db: string | null) => void;
  setCurrentCollection: (col: string | null) => void;
  addRecentProject: (path: string) => void;
  removeRecentProject: (path: string) => void;
  addQueryHistory: (text: string) => void;
  removeQueryHistory: (text: string) => void;
  clearQueryHistory: () => void;
  setApiUrl: (url: string) => void;
  setSidecarStatus: (status: AppState["sidecarStatus"]) => void;
  setDarkMode: (dark: boolean) => void;
  setTheme: (theme: Theme) => void;
  setAiProvider: (provider: string) => void;
  setAiModel: (model: string) => void;
  setAiApiKey: (key: string) => void;
  resetIngestSession: () => void;
  appendIngestProgress: (item: ProgressItem) => void;
  setIngestFilesDone: (n: number) => void;
  setIngestFilesTotal: (n: number) => void;
  setIngestRunning: (v: boolean) => void;
  setIngestStreamError: (err: string | null) => void;
  setLastIngestResult: (r: LastIngestResult | null) => void;
  setIngestDoneUnread: (v: boolean) => void;
  setCollectionType: (dbPath: string, collection: string, type: "files" | "sqlite") => void;
  removeCollectionType: (dbPath: string, collection: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentDb: null,
      currentCollection: null,
      recentProjects: [],
      queryHistory: [],
      apiUrl: "http://localhost:8000",
      sidecarStatus: "starting",
      sidecarReconnectSeq: 0,
      darkMode: false,
      theme: "default",
      aiProvider: "",
      aiModel: "",
      aiApiKey: "",
      ingestRunning: false,
      ingestProgress: [],
      ingestFilesDone: 0,
      ingestFilesTotal: 0,
      ingestStreamError: null,
      ingestDoneUnread: false,
      lastIngestResult: null,
      collectionTypes: {},

      setCurrentDb: (db) => set({ currentDb: db }),
      setCurrentCollection: (col) => set({ currentCollection: col }),

      addRecentProject: (path) => {
        const filtered = get().recentProjects.filter((p) => p.path !== path);
        set({
          recentProjects: [
            { path, lastOpened: new Date().toISOString() },
            ...filtered,
          ].slice(0, 10),
        });
      },

      removeRecentProject: (path) => {
        set({
          recentProjects: get().recentProjects.filter((p) => p.path !== path),
        });
      },

      addQueryHistory: (text) => {
        const filtered = get().queryHistory.filter((q) => q !== text);
        set({ queryHistory: [text, ...filtered].slice(0, 20) });
      },

      removeQueryHistory: (text) => {
        set({ queryHistory: get().queryHistory.filter((q) => q !== text) });
      },

      clearQueryHistory: () => {
        set({ queryHistory: [] });
      },

      setApiUrl:         (url)      => set({ apiUrl: url }),
      setSidecarStatus:        (status) => set({ sidecarStatus: status }),
      triggerSidecarReconnect: ()       => set((s) => ({ sidecarReconnectSeq: s.sidecarReconnectSeq + 1 })),
      setDarkMode:       (dark)     => set({ darkMode: dark }),
      setTheme:          (theme)    => set({ theme }),
      setAiProvider:     (provider) => set({ aiProvider: provider }),
      setAiModel:        (model)    => set({ aiModel: model }),
      setAiApiKey:       (key)      => set({ aiApiKey: key }),

      resetIngestSession: () => set({
        ingestRunning:     false,
        ingestProgress:    [],
        ingestFilesDone:   0,
        ingestFilesTotal:  0,
        ingestStreamError: null,
      }),

      appendIngestProgress: (item) =>
        set({ ingestProgress: [...get().ingestProgress, item] }),

      setIngestFilesDone:   (n)   => set({ ingestFilesDone: n }),
      setIngestFilesTotal:  (n)   => set({ ingestFilesTotal: n }),
      setIngestRunning:     (v)   => set({ ingestRunning: v }),
      setIngestStreamError: (err) => set({ ingestStreamError: err }),
      setLastIngestResult:  (r)   => set({ lastIngestResult: r }),
      setIngestDoneUnread:  (v)   => set({ ingestDoneUnread: v }),
      setCollectionType: (dbPath, collection, type) =>
        set((s) => ({
          collectionTypes: {
            ...s.collectionTypes,
            [`${dbPath}::${collection}`]: type,
          },
        })),
      removeCollectionType: (dbPath, collection) =>
        set((s) => {
          const next = { ...s.collectionTypes };
          delete next[`${dbPath}::${collection}`];
          return { collectionTypes: next };
        }),
    }),
    {
      name: "remex-studio",
      partialize: (state) => ({
        recentProjects:   state.recentProjects,
        queryHistory:     state.queryHistory,
        apiUrl:           state.apiUrl,
        darkMode:         state.darkMode,
        theme:            state.theme,
        aiProvider:       state.aiProvider,
        aiModel:          state.aiModel,
        aiApiKey:         state.aiApiKey,
        lastIngestResult: state.lastIngestResult,
        collectionTypes:  state.collectionTypes,
      }),
    }
  )
);
