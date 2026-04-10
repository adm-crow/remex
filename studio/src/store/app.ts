import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentProject {
  path: string;
  lastOpened: string;
}

export interface AppState {
  currentDb: string | null;
  currentCollection: string | null;
  recentProjects: RecentProject[];
  apiUrl: string;
  sidecarStatus: "starting" | "connected" | "error";
  // Actions
  setCurrentDb: (db: string | null) => void;
  setCurrentCollection: (col: string | null) => void;
  addRecentProject: (path: string) => void;
  setApiUrl: (url: string) => void;
  setSidecarStatus: (status: AppState["sidecarStatus"]) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentDb: null,
      currentCollection: null,
      recentProjects: [],
      apiUrl: "http://localhost:8000",
      sidecarStatus: "starting",

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

      setApiUrl: (url) => set({ apiUrl: url }),
      setSidecarStatus: (status) => set({ sidecarStatus: status }),
    }),
    {
      name: "remex-studio",
      // Only persist user preferences — runtime state resets each launch
      partialize: (state) => ({
        recentProjects: state.recentProjects,
        apiUrl: state.apiUrl,
      }),
    }
  )
);
