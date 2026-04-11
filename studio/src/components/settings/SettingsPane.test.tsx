import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SettingsPane } from "./SettingsPane";
import { useAppStore } from "@/store/app";

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
  it("renders the current API URL in the input", () => {
    renderWithProviders(<SettingsPane />);
    const input = screen.getByRole("textbox", {
      name: /api url/i,
    }) as HTMLInputElement;
    expect(input.value).toBe("http://localhost:8000");
  });

  it("saving updated API URL updates the store", () => {
    renderWithProviders(<SettingsPane />);
    const input = screen.getByRole("textbox", { name: /api url/i });
    fireEvent.change(input, { target: { value: "http://localhost:9000" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(useAppStore.getState().apiUrl).toBe("http://localhost:9000");
  });

  it("saving empty URL falls back to default", () => {
    renderWithProviders(<SettingsPane />);
    const input = screen.getByRole("textbox", { name: /api url/i });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(useAppStore.getState().apiUrl).toBe("http://localhost:8000");
  });

  it("change project button clears currentDb and currentCollection", () => {
    renderWithProviders(<SettingsPane />);
    fireEvent.click(screen.getByRole("button", { name: /change project/i }));
    expect(useAppStore.getState().currentDb).toBeNull();
    expect(useAppStore.getState().currentCollection).toBeNull();
  });
});
