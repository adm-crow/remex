import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "@/store/app";
import { Home } from "@/pages/Home";
import { AppShell } from "@/components/layout/AppShell";
import { useSidecar } from "@/hooks/useSidecar";
import { UpgradeModal } from "@/components/license/UpgradeModal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function App() {
  const currentDb = useAppStore((s) => s.currentDb);
  const darkMode = useAppStore((s) => s.darkMode);
  const darkModeAuto = useAppStore((s) => s.darkModeAuto);
  const setDarkMode = useAppStore((s) => s.setDarkMode);
  const theme = useAppStore((s) => s.theme);
  useSidecar();

  // Sync dark mode with system preference when Auto is enabled.
  useEffect(() => {
    if (!darkModeAuto) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDarkMode(mq.matches);
    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [darkModeAuto, setDarkMode]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("dark", darkMode);
    if (theme === "default") {
      html.removeAttribute("data-theme");
    } else {
      html.setAttribute("data-theme", theme);
    }
  }, [darkMode, theme]);

  useEffect(() => {
    const store = useAppStore.getState();
    void (async () => {
      await store.refreshLicenseStatus();
      try {
        const { licenseApi } = await import("@/lib/licenseApi");
        if (await licenseApi.shouldRevalidate()) {
          await store.revalidateLicense();
        }
      } catch { /* ignore */ }
      const s = useAppStore.getState();
      if (s.license.tier === "pro") {
        const { invoke } = await import("@tauri-apps/api/core");
        for (const p of s.watchFolders) {
          try { await invoke("watch_start", { folder: p }); } catch { /* ignore */ }
        }
      }
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {currentDb ? <AppShell /> : <Home />}
      <UpgradeModal />
    </QueryClientProvider>
  );
}
