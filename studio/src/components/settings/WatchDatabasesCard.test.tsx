import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { WatchDatabasesCard } from "./WatchDatabasesCard";
import { useAppStore } from "@/store/app";

describe("WatchDatabasesCard", () => {
  beforeEach(() => {
    useAppStore.setState({
      watchDatabases: [],
      currentDb: null,
      collectionTypes: {},
    });
  });

  it("renders the card with the Add database control", () => {
    renderWithProviders(<WatchDatabasesCard />);
    expect(screen.getByText(/Watch databases/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add database/ })).toBeInTheDocument();
  });

  it("renders persisted database watches with their table and target collection", () => {
    useAppStore.setState({
      watchDatabases: [
        { dbPath: "C:/data/app.sqlite",  table: "events", collection: "logs" },
        { dbPath: "/var/db/users.sqlite", table: "users",  collection: "people" },
      ],
    });
    renderWithProviders(<WatchDatabasesCard />);
    expect(screen.getByText("app.sqlite")).toBeInTheDocument();
    expect(screen.getByText("events")).toBeInTheDocument();
    expect(screen.getByText("users.sqlite")).toBeInTheDocument();
    expect(screen.getByText("users")).toBeInTheDocument();
  });

  it("opens an inline wizard with file/table/collection fields when Add is clicked", () => {
    renderWithProviders(<WatchDatabasesCard />);
    fireEvent.click(screen.getByRole("button", { name: /Add database/ }));
    expect(screen.getByText(/SQLite file/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Table$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target collection/i)).toBeInTheDocument();
    // Add button is disabled until file + table + collection are all set.
    expect(screen.getByRole("button", { name: /^Add$/i })).toBeDisabled();
  });
});
