import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "@/store/app";
import { Home } from "@/pages/Home";
import { AppShell } from "@/components/layout/AppShell";

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

  return (
    <QueryClientProvider client={queryClient}>
      {currentDb ? <AppShell /> : <Home />}
    </QueryClientProvider>
  );
}
