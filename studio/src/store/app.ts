import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

export interface RecentProject {
  path: string;
  lastOpened: string;
}

export type Theme =
  | "default" | "violet" | "green" | "lime" | "yellow" | "rose" | "coral" | "slate"
  | "midnight" | "forest" | "ocean" | "sunset" | "rosegold" | "teal" | "amethyst" | "graphite";

export type HomeBg = "dotgrid" | "aurora" | "network";

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
  skippedReasons: string[];
}

export interface FileIngestParams {
  sourcePath: string;
  chunkSize: number;
  overlap: number;
  embeddingModel: string;
  incremental: boolean;
  chunking: "word" | "sentence" | "recursive";
}

/** Per-project ingest defaults. When a new collection is being created, the
 *  Ingest tabs seed their fields from these values instead of hard-coded ones.
 *  Stored per `dbPath` so multiple projects can have different conventions. */
export interface ProjectDefaults {
  chunkSize?: number;
  overlap?: number;
  chunking?: "word" | "sentence" | "recursive";
  embeddingModel?: string;
}

/** A user-defined embedding model entry. Surfaces in the EmbeddingModelField
 *  picker alongside the built-in `Light` / `Balanced` / `Multilingual` presets. */
export interface CustomEmbeddingPreset {
  tag:   string;
  model: string;
  desc?: string;
}

/** A named AI agent configuration. Switched via the QueryPane persona dropdown.
 *  Only the `systemPrompt` varies per persona for now — the provider/model/key
 *  stay project-global because they're tied to user credentials. */
export interface AgentPersona {
  id:           string;
  name:         string;
  systemPrompt: string;
}

/** Persisted watch entry for a directory. Each watch must target a specific
 *  collection — the v2 "use current collection" fallback was removed in v3 to
 *  eliminate ambiguity at fire time (the current collection could be anything). */
export interface WatchFolder {
  path: string;
  collection: string;
}

/** Persisted watch entry for a SQLite database file. The watch fires on any
 *  write to the file (including its `-wal` / `-shm` siblings); the frontend
 *  then re-runs `ingest_sqlite` with the stored config + `incremental: true`. */
export interface WatchDatabase {
  dbPath: string;
  table: string;
  collection: string;
  /** Optional column subset; omitted = ingest all columns. */
  columns?: string[];
  /** Identity column for incremental dedup; defaults to `"id"`. */
  idColumn?: string;
  /** Optional row-to-text template; omitted = default serialisation. */
  rowTemplate?: string;
}

export interface AppState {
  currentDb: string | null;
  currentCollection: string | null;
  recentProjects: RecentProject[];
  queryHistory: string[];
  apiUrl: string;
  sidecarStatus: "starting" | "connected" | "error" | "setup" | "setup_error" | "setup_config";
  sidecarError: string;
  setupStep: string;
  setupProgress: number;
  setupError: string;
  setupExtras: string[];
  setupLogLines: string[];
  darkMode: boolean;
  theme: Theme;
  homeBg: HomeBg;
  aiProvider: string;
  aiModel: string;
  aiApiKey: string;
  // Sidecar reconnect (not persisted)
  sidecarReconnectSeq: number;
  triggerSidecarReconnect: () => void;
  // Appearance (persisted)
  darkModeAuto: boolean;
  setDarkModeAuto: (v: boolean) => void;
  // Re-ingest params per collection (persisted) — keyed "${dbPath}::${collection}"
  lastIngestParamsMap: Record<string, FileIngestParams>;
  setLastIngestParams: (dbPath: string, collection: string, params: FileIngestParams) => void;
  removeLastIngestParams: (dbPath: string, collection: string) => void;
  // Ingest prefill / nav request (not persisted)
  ingestPrefill: FileIngestParams | null;
  setIngestPrefill: (params: FileIngestParams | null) => void;
  requestedView: string | null;
  setRequestedView: (view: string | null) => void;
  // Files ingest session state (not persisted)
  ingestRunning: boolean;
  ingestProgress: ProgressItem[];
  ingestFilesDone: number;
  ingestFilesTotal: number;
  ingestStreamError: string | null;
  ingestDoneUnread: boolean;
  // SQLite ingest session state (not persisted)
  sqliteIngestRunning: boolean;
  sqliteIngestRowsDone: number;
  sqliteIngestRowsTotal: number;
  sqliteIngestStreamError: string | null;
  // Ingest result (persisted)
  lastIngestResult: LastIngestResult | null;
  // Collection metadata (persisted)
  collectionTypes: Record<string, "files" | "sqlite">;
  incompleteCollections: Record<string, true>;
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
  setSidecarError: (message: string) => void;
  setSetupProgress: (step: string, index: number) => void;
  setSetupError: (message: string) => void;
  setSetupExtras: (extras: string[]) => void;
  completeSetup: (extras: string[]) => void;
  appendSetupLog: (line: string) => void;
  clearSetupLog: () => void;
  setDarkMode: (dark: boolean) => void;
  setTheme: (theme: Theme) => void;
  setHomeBg: (bg: HomeBg) => void;
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
  resetSqliteIngestSession: () => void;
  setSqliteIngestRunning: (v: boolean) => void;
  setSqliteIngestRowsDone: (n: number) => void;
  setSqliteIngestRowsTotal: (n: number) => void;
  setSqliteIngestStreamError: (err: string | null) => void;
  setCollectionType: (dbPath: string, collection: string, type: "files" | "sqlite") => void;
  removeCollectionType: (dbPath: string, collection: string) => void;
  setIncompleteCollection: (dbPath: string, collection: string) => void;
  clearIncompleteCollection: (dbPath: string, collection: string) => void;
  // Onboarding
  onboardingDone: boolean;
  setOnboardingDone: (v: boolean) => void;
  // Keyboard shortcuts modal (not persisted)
  shortcutsOpen: boolean;
  setShortcutsOpen: (v: boolean) => void;
  // Per-project ingest defaults (persisted, keyed by dbPath)
  projectDefaults: Record<string, ProjectDefaults>;
  setProjectDefaults: (dbPath: string, defaults: ProjectDefaults) => void;
  // User-defined embedding-model presets (persisted, global to the user)
  customEmbeddingPresets: CustomEmbeddingPreset[];
  addCustomEmbeddingPreset:    (preset: CustomEmbeddingPreset) => void;
  removeCustomEmbeddingPreset: (model: string) => void;
  // AI agent personas (persisted, global to the user)
  agentPersonas:    AgentPersona[];
  activePersonaId:  string | null;
  addAgentPersona:    (persona: AgentPersona) => void;
  updateAgentPersona: (id: string, patch: Partial<Omit<AgentPersona, "id">>) => void;
  removeAgentPersona: (id: string) => void;
  setActivePersonaId: (id: string | null) => void;
  // Watch folders (persisted) — auto-ingest documents when a folder changes
  watchFolders: WatchFolder[];
  addWatchFolder:    (path: string, collection: string) => Promise<void>;
  removeWatchFolder: (path: string) => Promise<void>;
  setWatchFolderCollection: (path: string, collection: string) => void;
  // Watch databases (persisted) — auto-ingest SQLite rows when the .sqlite file changes
  watchDatabases: WatchDatabase[];
  addWatchDatabase:    (entry: WatchDatabase) => Promise<void>;
  removeWatchDatabase: (dbPath: string) => Promise<void>;
  setWatchDatabaseCollection: (dbPath: string, collection: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentDb: null,
      currentCollection: null,
      recentProjects: [],
      queryHistory: [],
      apiUrl: "http://127.0.0.1:8000",
      sidecarStatus: "starting",
      sidecarError: "",
      setupStep: "",
      setupProgress: 0,
      setupError: "",
      setupExtras: [],
      setupLogLines: [],
      sidecarReconnectSeq: 0,
      darkMode: false,
      darkModeAuto: false,
      lastIngestParamsMap: {},
      ingestPrefill: null,
      requestedView: null,
      theme: "default",
      homeBg: "dotgrid",
      aiProvider: "",
      aiModel: "",
      aiApiKey: "",
      ingestRunning: false,
      ingestProgress: [],
      ingestFilesDone: 0,
      ingestFilesTotal: 0,
      ingestStreamError: null,
      ingestDoneUnread: false,
      sqliteIngestRunning: false,
      sqliteIngestRowsDone: 0,
      sqliteIngestRowsTotal: 0,
      sqliteIngestStreamError: null,
      lastIngestResult: null,
      collectionTypes: {},
      incompleteCollections: {},
      onboardingDone: false,
      shortcutsOpen: false,
      watchFolders: [],
      watchDatabases: [],
      projectDefaults: {},
      customEmbeddingPresets: [],
      agentPersonas: [],
      activePersonaId: null,

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
        set({ queryHistory: [text, ...filtered].slice(0, 1000) });
      },

      removeQueryHistory: (text) => {
        set({ queryHistory: get().queryHistory.filter((q) => q !== text) });
      },

      clearQueryHistory: () => {
        set({ queryHistory: [] });
      },

      setApiUrl:         (url)      => set({ apiUrl: url }),
      setSidecarStatus:        (status) => set({ sidecarStatus: status }),
      setSidecarError:         (message) => set({ sidecarError: message }),
      setSetupProgress: (step, index) => set({ setupStep: step, setupProgress: index }),
      setSetupError:    (message)     => set({ setupError: message }),
      setSetupExtras:   (extras)      => set({ setupExtras: extras }),
      completeSetup:    (extras)      => set((s) => ({ setupExtras: extras, sidecarReconnectSeq: s.sidecarReconnectSeq + 1 })),
      appendSetupLog:   (line)        => set((s) => ({ setupLogLines: [...s.setupLogLines.slice(-99), line] })),
      clearSetupLog:    ()            => set({ setupLogLines: [] }),
      triggerSidecarReconnect: ()       => set((s) => ({ sidecarReconnectSeq: s.sidecarReconnectSeq + 1 })),
      setDarkMode:       (dark)     => set({ darkMode: dark }),
      setDarkModeAuto:   (v)        => set({ darkModeAuto: v }),
      setLastIngestParams: (dbPath, collection, params) =>
        set((s) => ({ lastIngestParamsMap: { ...s.lastIngestParamsMap, [`${dbPath}::${collection}`]: params } })),
      removeLastIngestParams: (dbPath, collection) =>
        set((s) => {
          const next = { ...s.lastIngestParamsMap };
          delete next[`${dbPath}::${collection}`];
          return { lastIngestParamsMap: next };
        }),
      setIngestPrefill:  (params)   => set({ ingestPrefill: params }),
      setRequestedView:  (view)     => set({ requestedView: view }),
      setTheme:          (theme)    => set({ theme }),
      setHomeBg:         (homeBg)   => set({ homeBg }),
      setAiProvider:          (provider) => set({ aiProvider: provider }),
      setAiModel:             (model)    => set({ aiModel: model }),
      setAiApiKey:            (key)      => set({ aiApiKey: key }),

      resetIngestSession: () => set({
        ingestRunning:     false,
        ingestProgress:    [],
        ingestFilesDone:   0,
        ingestFilesTotal:  0,
        ingestStreamError: null,
      }),

      appendIngestProgress: (item) => {
        const prev = get().ingestProgress;
        const next = prev.length >= 500 ? [...prev.slice(-499), item] : [...prev, item];
        set({ ingestProgress: next });
      },

      setIngestFilesDone:   (n)   => set({ ingestFilesDone: n }),
      setIngestFilesTotal:  (n)   => set({ ingestFilesTotal: n }),
      setIngestRunning:     (v)   => set({ ingestRunning: v }),
      setIngestStreamError: (err) => set({ ingestStreamError: err }),
      setLastIngestResult:  (r)   => set({ lastIngestResult: r }),
      setIngestDoneUnread:  (v)   => set({ ingestDoneUnread: v }),
      resetSqliteIngestSession: () => set({
        sqliteIngestRunning:     false,
        sqliteIngestRowsDone:    0,
        sqliteIngestRowsTotal:   0,
        sqliteIngestStreamError: null,
      }),
      setSqliteIngestRunning:     (v)   => set({ sqliteIngestRunning: v }),
      setSqliteIngestRowsDone:    (n)   => set({ sqliteIngestRowsDone: n }),
      setSqliteIngestRowsTotal:   (n)   => set({ sqliteIngestRowsTotal: n }),
      setSqliteIngestStreamError: (err) => set({ sqliteIngestStreamError: err }),

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
      setIncompleteCollection: (dbPath, collection) =>
        set((s) => ({
          incompleteCollections: {
            ...s.incompleteCollections,
            [`${dbPath}::${collection}`]: true,
          },
        })),
      clearIncompleteCollection: (dbPath, collection) =>
        set((s) => {
          const next = { ...s.incompleteCollections };
          delete next[`${dbPath}::${collection}`];
          return { incompleteCollections: next };
        }),
      setOnboardingDone: (v) => set({ onboardingDone: v }),
      setShortcutsOpen:  (v) => set({ shortcutsOpen: v }),

      setProjectDefaults: (dbPath, defaults) =>
        set((s) => ({
          projectDefaults: { ...s.projectDefaults, [dbPath]: defaults },
        })),

      addCustomEmbeddingPreset: (preset) =>
        set((s) => {
          if (s.customEmbeddingPresets.some((p) => p.model === preset.model)) return s;
          return { customEmbeddingPresets: [...s.customEmbeddingPresets, preset] };
        }),
      removeCustomEmbeddingPreset: (model) =>
        set((s) => ({
          customEmbeddingPresets: s.customEmbeddingPresets.filter((p) => p.model !== model),
        })),

      addAgentPersona: (persona) =>
        set((s) => {
          if (s.agentPersonas.some((p) => p.id === persona.id)) return s;
          // First persona added becomes active automatically.
          const activate = s.activePersonaId === null;
          return {
            agentPersonas:   [...s.agentPersonas, persona],
            activePersonaId: activate ? persona.id : s.activePersonaId,
          };
        }),
      updateAgentPersona: (id, patch) =>
        set((s) => ({
          agentPersonas: s.agentPersonas.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removeAgentPersona: (id) =>
        set((s) => {
          const next = s.agentPersonas.filter((p) => p.id !== id);
          // If the removed persona was active, promote the first remaining (or clear).
          const activePersonaId =
            s.activePersonaId === id ? (next[0]?.id ?? null) : s.activePersonaId;
          return { agentPersonas: next, activePersonaId };
        }),
      setActivePersonaId: (id) => set({ activePersonaId: id }),

      addWatchFolder: async (path, collection) => {
        await invoke("watch_start", { folder: path }); // throws if the folder is gone
        set((s) => {
          if (s.watchFolders.some((w) => w.path === path)) return s;
          return { watchFolders: [...s.watchFolders, { path, collection }] };
        });
      },
      removeWatchFolder: async (path) => {
        await invoke("watch_stop", { folder: path });
        set((s) => ({ watchFolders: s.watchFolders.filter((w) => w.path !== path) }));
      },
      setWatchFolderCollection: (path, collection) =>
        set((s) => ({
          watchFolders: s.watchFolders.map((w) =>
            w.path === path ? { ...w, collection } : w
          ),
        })),

      addWatchDatabase: async (entry) => {
        await invoke("watch_db_start", { dbPath: entry.dbPath });
        set((s) => {
          if (s.watchDatabases.some((w) => w.dbPath === entry.dbPath)) return s;
          return { watchDatabases: [...s.watchDatabases, entry] };
        });
      },
      removeWatchDatabase: async (dbPath) => {
        await invoke("watch_db_stop", { dbPath });
        set((s) => ({ watchDatabases: s.watchDatabases.filter((w) => w.dbPath !== dbPath) }));
      },
      setWatchDatabaseCollection: (dbPath, collection) =>
        set((s) => ({
          watchDatabases: s.watchDatabases.map((w) =>
            w.dbPath === dbPath ? { ...w, collection } : w
          ),
        })),
    }),
    {
      name: "remex-studio",
      version: 4,
      // Forward-only migration. Each step transforms in place.
      migrate: (persistedState, version) => {
        const s = (persistedState ?? {}) as Record<string, unknown>;
        // v1 → v2: watchFolders changed from `string[]` to `Array<{path, collection: null}>`
        // so each entry can target a specific collection instead of the currently-selected one.
        if (version < 2 && Array.isArray(s.watchFolders)) {
          s.watchFolders = (s.watchFolders as unknown[]).map((entry) =>
            typeof entry === "string"
              ? { path: entry, collection: null }
              : entry
          );
        }
        // v2 → v3: WatchFolder.collection is now a required string. Drop entries
        // whose collection is null/missing — the "use current collection" fallback
        // was removed because it relied on UI-only state at fire time.
        if (version < 3 && Array.isArray(s.watchFolders)) {
          s.watchFolders = (s.watchFolders as unknown[]).filter((entry) => {
            if (typeof entry !== "object" || entry === null) return false;
            const c = (entry as { collection?: unknown }).collection;
            return typeof c === "string" && c.length > 0;
          });
        }
        // v3 → v4: agentSystemPrompt (single string) becomes agentPersonas (list).
        // Existing prompt becomes a single "Default" persona, automatically active.
        if (version < 4) {
          const oldPrompt = typeof s.agentSystemPrompt === "string" ? s.agentSystemPrompt : "";
          if (!Array.isArray(s.agentPersonas) || s.agentPersonas.length === 0) {
            if (oldPrompt.length > 0) {
              const id = "default";
              s.agentPersonas    = [{ id, name: "Default", systemPrompt: oldPrompt }];
              s.activePersonaId  = id;
            } else {
              s.agentPersonas    = [];
              s.activePersonaId  = null;
            }
          }
          delete s.agentSystemPrompt;
        }
        return s as ReturnType<typeof partialize>;
      },
      partialize,
    }
  )
);

// Extracted so `migrate` can refer to its return type without duplicating the shape.
function partialize(state: AppState) {
  return {
    recentProjects:        state.recentProjects,
    queryHistory:          state.queryHistory,
    apiUrl:                state.apiUrl,
    darkMode:              state.darkMode,
    darkModeAuto:          state.darkModeAuto,
    lastIngestParamsMap:   state.lastIngestParamsMap,
    theme:                 state.theme,
    aiProvider:            state.aiProvider,
    aiModel:               state.aiModel,
    agentPersonas:         state.agentPersonas,
    activePersonaId:       state.activePersonaId,
    projectDefaults:       state.projectDefaults,
    customEmbeddingPresets: state.customEmbeddingPresets,
    // aiApiKey intentionally NOT persisted — re-entered each session to avoid
    // storing credentials in plaintext localStorage.
    homeBg:                state.homeBg,
    lastIngestResult:      state.lastIngestResult,
    collectionTypes:       state.collectionTypes,
    incompleteCollections: state.incompleteCollections,
    onboardingDone:        state.onboardingDone,
    watchFolders:          state.watchFolders,
    watchDatabases:        state.watchDatabases,
    setupExtras:           state.setupExtras,
  };
}
