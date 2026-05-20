import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SettingsPane } from "./SettingsPane";
import { useAppStore } from "@/store/app";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("1.2.3"),
}));

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  } as any);
});

describe("SettingsPane", () => {
  it("renders the current API URL in the input", async () => {
    renderWithProviders(<SettingsPane />);
    fireEvent.click(screen.getByRole("button", { name: /AI & Server/i }));
    const input = screen.getByRole("textbox", {
      name: /api url/i,
    }) as HTMLInputElement;
    expect(input.value).toBe("http://localhost:8000");
    await waitFor(() => {}); // drain async queue (getVersion useEffect)
  });

  it("saving updated API URL updates the store", async () => {
    renderWithProviders(<SettingsPane />);
    fireEvent.click(screen.getByRole("button", { name: /AI & Server/i }));
    const input = screen.getByRole("textbox", { name: /api url/i });
    fireEvent.change(input, { target: { value: "http://localhost:9000" } });
    fireEvent.submit(input.closest("form")!);
    expect(useAppStore.getState().apiUrl).toBe("http://localhost:9000");
    await waitFor(() => {}); // drain async queue (getVersion useEffect)
  });

  it("saving empty URL falls back to default", async () => {
    renderWithProviders(<SettingsPane />);
    fireEvent.click(screen.getByRole("button", { name: /AI & Server/i }));
    const input = screen.getByRole("textbox", { name: /api url/i });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);
    expect(useAppStore.getState().apiUrl).toBe("http://localhost:8000");
    await waitFor(() => {}); // drain async queue (getVersion useEffect)
  });

  // "Change project" is on the Sidebar — see `layout.test.tsx`.

  it("displays app version loaded from Tauri", async () => {
    renderWithProviders(<SettingsPane />);
    await waitFor(() => {
      expect(screen.getByText(/1\.2\.3/)).toBeInTheDocument();
    });
  });

  it("footer Welcome guide button resets onboarding", async () => {
    useAppStore.setState({ onboardingDone: true } as any);
    renderWithProviders(<SettingsPane />);
    fireEvent.click(screen.getByRole("button", { name: /show welcome guide/i }));
    expect(useAppStore.getState().onboardingDone).toBe(false);
    await waitFor(() => {});
  });

  it("footer Shortcuts button opens the shortcuts modal", async () => {
    renderWithProviders(<SettingsPane />);
    fireEvent.click(screen.getByRole("button", { name: /keyboard shortcuts/i }));
    expect(useAppStore.getState().shortcutsOpen).toBe(true);
    await waitFor(() => {});
  });
});

describe("SettingsPane — theme selection", () => {
  beforeEach(() => {
    useAppStore.setState({ theme: "default" } as any);
  });

  it("clicking any theme sets it on the store", async () => {
    renderWithProviders(<SettingsPane />);
    fireEvent.click(screen.getByLabelText("Midnight"));
    expect(useAppStore.getState().theme).toBe("midnight");
    await waitFor(() => {}); // drain async queue (getVersion useEffect)
  });
});
