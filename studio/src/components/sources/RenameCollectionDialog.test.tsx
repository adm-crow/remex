import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { RenameCollectionDialog } from "./RenameCollectionDialog";

const defaultProps = {
  open: true,
  currentName: "my-collection",
  onClose: vi.fn(),
  onRename: vi.fn(),
  isLoading: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RenameCollectionDialog", () => {
  it("renders dialog with current name pre-filled", () => {
    renderWithProviders(<RenameCollectionDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/new collection name/i)).toHaveValue(
      "my-collection"
    );
  });

  it("does not render when open is false", () => {
    renderWithProviders(
      <RenameCollectionDialog {...defaultProps} open={false} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onRename with trimmed value on submit", () => {
    renderWithProviders(<RenameCollectionDialog {...defaultProps} />);
    const input = screen.getByLabelText(/new collection name/i);
    fireEvent.change(input, { target: { value: "  new-name  " } });
    fireEvent.click(screen.getByRole("button", { name: /^rename$/i }));
    expect(defaultProps.onRename).toHaveBeenCalledWith("new-name");
  });

  it("does not call onRename when value equals current name", () => {
    renderWithProviders(<RenameCollectionDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^rename$/i }));
    expect(defaultProps.onRename).not.toHaveBeenCalled();
  });

  it("does not call onRename when value is empty", () => {
    renderWithProviders(<RenameCollectionDialog {...defaultProps} />);
    const input = screen.getByLabelText(/new collection name/i);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /^rename$/i }));
    expect(defaultProps.onRename).not.toHaveBeenCalled();
  });

  it("rename button is disabled when value equals currentName", () => {
    renderWithProviders(<RenameCollectionDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: /^rename$/i })).toBeDisabled();
  });

  it("rename button is disabled when isLoading", () => {
    renderWithProviders(
      <RenameCollectionDialog {...defaultProps} isLoading={true} />
    );
    const input = screen.getByLabelText(/new collection name/i);
    fireEvent.change(input, { target: { value: "different" } });
    expect(screen.getByRole("button", { name: /renaming/i })).toBeDisabled();
  });

  it("calls onClose when Cancel button is clicked", () => {
    renderWithProviders(<RenameCollectionDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
