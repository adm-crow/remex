import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { WatchFoldersCard } from "./WatchFoldersCard";
import { useAppStore } from "@/store/app";

describe("WatchFoldersCard", () => {
  beforeEach(() => {
    useAppStore.setState({ watchFolders: [], currentDb: null });
  });

  it("renders the card with the Add folder control", () => {
    renderWithProviders(<WatchFoldersCard />);
    expect(screen.getByText(/Watch folders/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add folder/ })).toBeInTheDocument();
  });

  it("renders persisted folders in the list with a collection dropdown per row", () => {
    useAppStore.setState({ watchFolders: [
      { path: "C:/tmp/foo",   collection: "docs" },
      { path: "/var/log/bar", collection: "logs" },
    ]});
    renderWithProviders(<WatchFoldersCard />);
    // Full path appears (as a tooltip-style subtitle), and the basename as the label.
    expect(screen.getByText("C:/tmp/foo")).toBeInTheDocument();
    expect(screen.getByText("/var/log/bar")).toBeInTheDocument();
    // Each row shows a dropdown labelled with the path.
    expect(screen.getByLabelText(/Target collection for C:\/tmp\/foo/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target collection for \/var\/log\/bar/)).toBeInTheDocument();
  });
});
