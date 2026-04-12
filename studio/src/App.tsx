import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "@/store/app";
import { Home } from "@/pages/Home";
import { AppShell } from "@/components/layout/AppShell";
import { useSidecar } from "@/hooks/useSidecar";

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
  const theme = useAppStore((s) => s.theme);
  useSidecar();

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("dark", darkMode);
    if (theme === "default") {
      html.removeAttribute("data-theme");
    } else {
      html.setAttribute("data-theme", theme);
    }
  }, [darkMode, theme]);

  return (
    <QueryClientProvider client={queryClient}>
      {currentDb ? <AppShell /> : <Home />}
    </QueryClientProvider>
  );
}
