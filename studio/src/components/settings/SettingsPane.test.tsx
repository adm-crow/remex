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
    const input = screen.getByRole("textbox", {
      name: /api url/i,
    }) as HTMLInputElement;
    expect(input.value).toBe("http://localhost:8000");
    await waitFor(() => {}); // drain async queue (getVersion useEffect)
  });

  it("saving updated API URL updates the store", async () => {
    renderWithProviders(<SettingsPane />);
    const input = screen.getByRole("textbox", { name: /api url/i });
    fireEvent.change(input, { target: { value: "http://localhost:9000" } });
    fireEvent.submit(input.closest("form")!);
    expect(useAppStore.getState().apiUrl).toBe("http://localhost:9000");
    await waitFor(() => {}); // drain async queue (getVersion useEffect)
  });

  it("saving empty URL falls back to default", async () => {
    renderWithProviders(<SettingsPane />);
    const input = screen.getByRole("textbox", { name: /api url/i });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);
    expect(useAppStore.getState().apiUrl).toBe("http://localhost:8000");
    await waitFor(() => {}); // drain async queue (getVersion useEffect)
  });

  it("change project button clears currentDb and currentCollection", async () => {
    renderWithProviders(<SettingsPane />);
    fireEvent.click(screen.getByRole("button", { name: /change project/i }));
    expect(useAppStore.getState().currentDb).toBeNull();
    expect(useAppStore.getState().currentCollection).toBeNull();
    await waitFor(() => {}); // drain async queue (getVersion useEffect)
  });

  it("displays app version loaded from Tauri", async () => {
    renderWithProviders(<SettingsPane />);
    await waitFor(() => {
      expect(screen.getByText(/1\.2\.3/)).toBeInTheDocument();
    });
  });
});

describe("SettingsPane — Pro theme gating", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
      theme: "default",
      upgradeModalOpen: false,
      upgradeModalContext: null,
    } as any);
  });

  it("clicking a Pro theme as free opens the upgrade modal with theme context", async () => {
    renderWithProviders(<SettingsPane />);
    fireEvent.click(screen.getByLabelText("Midnight"));
    expect(useAppStore.getState().upgradeModalOpen).toBe(true);
    expect(useAppStore.getState().upgradeModalContext).toBe("theme");
    expect(useAppStore.getState().theme).toBe("default");
    await waitFor(() => {}); // drain async queue (getVersion useEffect)
  });

  it("clicking a Pro theme as Pro sets the theme", async () => {
    useAppStore.setState({
      license: { tier: "pro", email: "x", activatedAt: 1, lastValidatedAt: 1 },
    } as any);
    renderWithProviders(<SettingsPane />);
    fireEvent.click(screen.getByLabelText("Midnight"));
    expect(useAppStore.getState().theme).toBe("midnight");
    await waitFor(() => {}); // drain async queue (getVersion useEffect)
  });
});
