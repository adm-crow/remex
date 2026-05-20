import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmbeddingModelField } from "./EmbeddingModelField";

describe("EmbeddingModelField — preset selection", () => {
  it("clicking the Light preset calls onChange with all-MiniLM-L6-v2", () => {
    let selected = "";
    render(<EmbeddingModelField value="" onChange={(v) => { selected = v; }} />);
    fireEvent.click(screen.getByTitle(/works offline/));
    expect(selected).toBe("all-MiniLM-L6-v2");
  });

  it("clicking the Large preset calls onChange with BAAI/bge-large-en-v1.5", () => {
    let selected = "";
    render(<EmbeddingModelField value="" onChange={(v) => { selected = v; }} />);
    fireEvent.click(screen.getByTitle(/best English accuracy/));
    expect(selected).toBe("BAAI/bge-large-en-v1.5");
  });
});

describe("EmbeddingModelField — compact mode", () => {
  it("renders 4 segment buttons", () => {
    render(<EmbeddingModelField value="all-MiniLM-L6-v2" onChange={() => {}} compact />);
    expect(screen.getByRole("button", { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /balanced/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /multilingual/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more/i })).toBeInTheDocument();
  });

  it("clicking a segment calls onChange with the correct model", () => {
    let selected = "";
    render(
      <EmbeddingModelField
        value="all-MiniLM-L6-v2"
        onChange={(v) => { selected = v; }}
        compact
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /balanced/i }));
    expect(selected).toBe("BAAI/bge-base-en-v1.5");
  });

  it("expansion panel is hidden by default", () => {
    render(<EmbeddingModelField value="all-MiniLM-L6-v2" onChange={() => {}} compact />);
    expect(screen.queryByTitle(/best English accuracy/)).not.toBeInTheDocument();
  });

  it("clicking More… shows the full preset list", () => {
    render(<EmbeddingModelField value="all-MiniLM-L6-v2" onChange={() => {}} compact />);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.getByTitle(/best English accuracy/)).toBeInTheDocument();
  });

  it("clicking More… again collapses the expansion panel", () => {
    render(<EmbeddingModelField value="all-MiniLM-L6-v2" onChange={() => {}} compact />);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.getByTitle(/best English accuracy/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.queryByTitle(/best English accuracy/)).not.toBeInTheDocument();
  });

  it("shows a 5th segment when a non-segment preset model is selected", () => {
    render(
      <EmbeddingModelField value="BAAI/bge-large-en-v1.5" onChange={() => {}} compact />
    );
    expect(screen.getByTestId("model-segment-extra")).toHaveTextContent("Large");
  });

  it("shows a 5th segment when a custom model string is selected", () => {
    render(
      <EmbeddingModelField value="my-org/my-custom-model" onChange={() => {}} compact />
    );
    expect(screen.getByTestId("model-segment-extra")).toBeInTheDocument();
  });

  it("clicking the 5th segment calls onChange with that model", () => {
    let selected = "";
    render(
      <EmbeddingModelField
        value="BAAI/bge-large-en-v1.5"
        onChange={(v) => { selected = v; }}
        compact
      />
    );
    fireEvent.click(screen.getByTestId("model-segment-extra"));
    expect(selected).toBe("BAAI/bge-large-en-v1.5");
  });
});
