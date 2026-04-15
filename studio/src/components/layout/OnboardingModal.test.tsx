import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { useAppStore } from "@/store/app";
import { OnboardingModal } from "./OnboardingModal";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ onboardingDone: false } as any);
});

describe("OnboardingModal", () => {
  it("renders when onboardingDone is false", () => {
    renderWithProviders(<OnboardingModal />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/welcome to remex studio/i)).toBeInTheDocument();
  });

  it("does not render when onboardingDone is true", () => {
    useAppStore.setState({ onboardingDone: true } as any);
    renderWithProviders(<OnboardingModal />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses and sets onboardingDone when Get Started is clicked", () => {
    renderWithProviders(<OnboardingModal />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useAppStore.getState().onboardingDone).toBe(true);
  });
});
