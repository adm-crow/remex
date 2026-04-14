import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentProject {
  path: string;
  lastOpened: string;
}

export type Theme = "default" | "blue" | "purple" | "green" | "rose" | "amber" | "teal" | "coral";

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
      darkMode: false,
      theme: "default",
      aiProvider: "",
      aiModel: "",
      aiApiKey: "",

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

      setApiUrl: (url) => set({ apiUrl: url }),
      setSidecarStatus: (status) => set({ sidecarStatus: status }),
      setDarkMode: (dark) => set({ darkMode: dark }),
      setTheme: (theme) => set({ theme }),
      setAiProvider: (provider) => set({ aiProvider: provider }),
      setAiModel: (model) => set({ aiModel: model }),
      setAiApiKey: (key) => set({ aiApiKey: key }),
    }),
    {
      name: "remex-studio",
      partialize: (state) => ({
        recentProjects: state.recentProjects,
        queryHistory: state.queryHistory,
        apiUrl: state.apiUrl,
        darkMode: state.darkMode,
        theme: state.theme,
        aiProvider: state.aiProvider,
        aiModel: state.aiModel,
        aiApiKey: state.aiApiKey,
      }),
    }
  )
);
