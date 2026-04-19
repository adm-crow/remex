import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WatchFoldersCard } from "./WatchFoldersCard";
import { useAppStore } from "@/store/app";

describe("WatchFoldersCard", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
      watchFolders: [],
    });
  });

  it("renders nothing when user is free", () => {
    const { container } = render(<WatchFoldersCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders card when user is Pro", () => {
    useAppStore.setState({
      license: { tier: "pro", email: "x", activatedAt: 1, lastValidatedAt: 1 },
    });
    render(<WatchFoldersCard />);
    expect(screen.getByText(/Watch folders/)).toBeInTheDocument();
  });
});
