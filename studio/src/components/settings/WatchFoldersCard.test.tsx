import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WatchFoldersCard } from "./WatchFoldersCard";
import { useAppStore } from "@/store/app";

describe("WatchFoldersCard", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
      watchFolders: [],
      upgradeModalOpen: false,
      upgradeModalContext: null,
    });
  });

  it("renders locked teaser when user is free", () => {
    render(<WatchFoldersCard />);
    expect(screen.getByText(/Watch folders/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unlock watch folders with Pro/ })).toBeInTheDocument();
  });

  it("opens upgrade modal when free user clicks the card", () => {
    render(<WatchFoldersCard />);
    fireEvent.click(screen.getByRole("button", { name: /Unlock watch folders with Pro/ }));
    expect(useAppStore.getState().upgradeModalOpen).toBe(true);
    expect(useAppStore.getState().upgradeModalContext).toBe("watch-folder");
  });

  it("renders card with folder controls when user is Pro", () => {
    useAppStore.setState({
      license: { tier: "pro", email: "x", activatedAt: 1, lastValidatedAt: 1 },
    });
    render(<WatchFoldersCard />);
    expect(screen.getByText(/Watch folders/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add folder/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unlock/ })).not.toBeInTheDocument();
  });
});
