import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { licenseApi, type LicenseStatus, type Tier } from "@/lib/licenseApi";

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
  chunking: "word" | "sentence";
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
  // Upgrade modal (not persisted)
  upgradeModalOpen: boolean;
  upgradeModalContext: string | null;
  openUpgradeModal:  (context?: string) => void;
  closeUpgradeModal: () => void;
  // License-entry prompt signal (not persisted) — incremented when the user
  // clicks "I already have a key" in the upgrade modal. AppShell switches to
  // Settings; LicenseCard reveals its paste input and focuses it.
  licensePromptSeq: number;
  requestLicensePrompt: () => void;
  // License (persisted subset)
  license: {
    tier: Tier;
    email: string | null;
    activatedAt: number | null;
    lastValidatedAt: number | null;
  };
  activateLicense:      (key: string) => Promise<{ ok: boolean; error?: string }>;
  deactivateLicense:    ()            => Promise<void>;
  revalidateLicense:    ()            => Promise<void>;
  refreshLicenseStatus: ()            => Promise<void>;
  // Watch folders (Pro, persisted)
  watchFolders: string[];
  addWatchFolder:    (path: string) => Promise<void>;
  removeWatchFolder: (path: string) => Promise<void>;
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
      upgradeModalOpen: false,
      upgradeModalContext: null,
      licensePromptSeq: 0,
      license: { tier: "free" as Tier, email: null, activatedAt: null, lastValidatedAt: null },
      watchFolders: [],

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
        const { license, queryHistory } = get();
        const filtered = queryHistory.filter((q) => q !== text);
        const cap = license.tier === "pro" ? 1000 : 20;
        set({ queryHistory: [text, ...filtered].slice(0, cap) });
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
      openUpgradeModal:  (context = "generic") => set({ upgradeModalOpen: true,  upgradeModalContext: context }),
      closeUpgradeModal: ()                    => set({ upgradeModalOpen: false, upgradeModalContext: null }),
      requestLicensePrompt: ()                 => set((s) => ({ licensePromptSeq: s.licensePromptSeq + 1 })),

      activateLicense: async (key) => {
        try {
          const s: LicenseStatus = await licenseApi.activate(key);
          set({ license: {
            tier: s.tier, email: s.email,
            activatedAt: s.activated_at, lastValidatedAt: s.last_validated_at,
          }});
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
      deactivateLicense: async () => {
        // Reset local state immediately so the UI responds without waiting for the network call.
        const { watchFolders } = get();
        for (const path of watchFolders) {
          await invoke("watch_stop", { folder: path }).catch(() => {});
        }
        set({
          license:      { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
          // Reset Pro-only settings so they don't persist after downgrade.
          homeBg:       "dotgrid",
          theme:        "default",
          watchFolders: [],
        });
        // Best-effort remote deactivation — fire-and-forget so UI isn't blocked.
        licenseApi.deactivate().catch(() => {});
      },
      revalidateLicense: async () => {
        try {
          const s = await licenseApi.revalidate();
          set({ license: {
            tier: s.tier, email: s.email,
            activatedAt: s.activated_at, lastValidatedAt: s.last_validated_at,
          }});
        } catch { /* soft-fail: keep current slice */ }
      },
      refreshLicenseStatus: async () => {
        try {
          const s = await licenseApi.status();
          set({ license: {
            tier: s.tier, email: s.email,
            activatedAt: s.activated_at, lastValidatedAt: s.last_validated_at,
          }});
        } catch { /* ignore */ }
      },
      addWatchFolder: async (path) => {
        await invoke("watch_start", { folder: path }); // throws on Pro gate failure or missing folder
        set((s) => ({ watchFolders: Array.from(new Set([...s.watchFolders, path])) }));
      },
      removeWatchFolder: async (path) => {
        await invoke("watch_stop", { folder: path });
        set((s) => ({ watchFolders: s.watchFolders.filter((p) => p !== path) }));
      },
    }),
    {
      name: "remex-studio",
      partialize: (state) => ({
        recentProjects:   state.recentProjects,
        queryHistory:     state.queryHistory,
        apiUrl:           state.apiUrl,
        darkMode:         state.darkMode,
        darkModeAuto:     state.darkModeAuto,
        lastIngestParamsMap: state.lastIngestParamsMap,
        theme:            state.theme,
        aiProvider:       state.aiProvider,
        aiModel:          state.aiModel,
        // aiApiKey intentionally NOT persisted — re-entered each session to avoid
        // storing credentials in plaintext localStorage.
        homeBg:           state.homeBg,
        lastIngestResult: state.lastIngestResult,
        collectionTypes:       state.collectionTypes,
        incompleteCollections: state.incompleteCollections,
        onboardingDone:        state.onboardingDone,
        watchFolders:          state.watchFolders,
        setupExtras:           state.setupExtras,
        // license intentionally NOT persisted — rehydrated from disk via Tauri at startup.
      }),
    }
  )
);

export const useIsPro = () => useAppStore((s) => s.license.tier === "pro");
