import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpgradeModal } from "./UpgradeModal";
import { useAppStore } from "@/store/app";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn().mockResolvedValue(undefined) }));
import { open } from "@tauri-apps/plugin-shell";

describe("UpgradeModal", () => {
  beforeEach(() => {
    useAppStore.setState({ upgradeModalOpen: true, upgradeModalContext: "generic" });
    vi.resetAllMocks();
  });

  it("always renders the full Pro feature list regardless of context", () => {
    useAppStore.setState({ upgradeModalOpen: true, upgradeModalContext: "embedding-model" });
    render(<UpgradeModal />);
    expect(screen.getByText(/Pro embedding models/)).toBeInTheDocument();
    expect(screen.getByText(/Watch-folder auto-ingest/)).toBeInTheDocument();
    expect(screen.getByText(/Advanced exports/)).toBeInTheDocument();
  });

  it("Buy Pro button opens the checkout URL", () => {
    render(<UpgradeModal />);
    fireEvent.click(screen.getByRole("button", { name: /Buy Pro/ }));
    expect(open).toHaveBeenCalledWith(expect.stringContaining("remex.lemonsqueezy.com"));
  });

  it("does not render when upgradeModalOpen is false", () => {
    useAppStore.setState({ upgradeModalOpen: false, upgradeModalContext: null });
    render(<UpgradeModal />);
    expect(screen.queryByText(/Upgrade to Remex Pro/)).not.toBeInTheDocument();
  });
});
