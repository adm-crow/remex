import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmbeddingModelField } from "./EmbeddingModelField";
import { useAppStore } from "@/store/app";

describe("EmbeddingModelField — Pro lock", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
      upgradeModalOpen: false,
    });
  });

  it("clicking a Pro preset as free opens the upgrade modal with embedding-model context", () => {
    render(<EmbeddingModelField value="" onChange={() => {}} />);
    fireEvent.click(screen.getByTitle(/best English accuracy/));
    expect(useAppStore.getState().upgradeModalOpen).toBe(true);
    expect(useAppStore.getState().upgradeModalContext).toBe("embedding-model");
  });

  it("clicking a Pro preset as Pro selects the model", () => {
    useAppStore.setState({
      license: { tier: "pro", email: "x", activatedAt: 1, lastValidatedAt: 1 },
    });
    let selected = "";
    render(<EmbeddingModelField value="" onChange={(v) => { selected = v; }} />);
    fireEvent.click(screen.getByTitle(/best English accuracy/));
    expect(selected).toBe("BAAI/bge-large-en-v1.5");
  });

  it("clicking a free preset works regardless of tier", () => {
    let selected = "";
    render(<EmbeddingModelField value="" onChange={(v) => { selected = v; }} />);
    fireEvent.click(screen.getByTitle(/works offline/));
    expect(selected).toBe("all-MiniLM-L6-v2");
  });
});
