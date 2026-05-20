import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollectionPicker } from "./CollectionPicker";

describe("CollectionPicker", () => {
  it("renders a free-text input when there are no existing collections", () => {
    render(<CollectionPicker value="" onChange={() => {}} existing={[]} />);
    expect(screen.getByRole("textbox", { name: /collection/i })).toBeInTheDocument();
    // No mode toggle is shown when there's nothing to pick from.
    expect(screen.queryByRole("button", { name: /pick existing collection/i })).not.toBeInTheDocument();
  });

  it("starts in 'existing' mode when value matches an existing collection", () => {
    render(<CollectionPicker value="docs" onChange={() => {}} existing={["docs", "logs"]} />);
    // Select trigger has role combobox.
    expect(screen.getByRole("combobox", { name: /collection/i })).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
  });

  it("starts in 'new' mode when value doesn't match any existing collection", () => {
    render(<CollectionPicker value="fresh" onChange={() => {}} existing={["docs", "logs"]} />);
    const input = screen.getByRole("textbox", { name: /collection/i }) as HTMLInputElement;
    expect(input.value).toBe("fresh");
  });

  it("toggle button flips from existing to new mode and back", () => {
    const onChange = vi.fn();
    render(<CollectionPicker value="docs" onChange={onChange} existing={["docs", "logs"]} />);
    // Initially: combobox visible, toggle reads "New"
    expect(screen.getByRole("combobox", { name: /collection/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /create new collection/i }));
    // Now: text input visible, toggle reads "Existing"
    expect(screen.getByRole("textbox", { name: /collection/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /pick existing collection/i }));
    expect(screen.getByRole("combobox", { name: /collection/i })).toBeInTheDocument();
  });
});
