import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LicenseCard } from "./LicenseCard";
import { useAppStore } from "@/store/app";

describe("LicenseCard — free state", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
      upgradeModalOpen: false,
    });
  });

  it("shows the Upgrade button and I-already-have-a-key secondary", () => {
    render(<LicenseCard />);
    expect(screen.getByRole("button", { name: /Upgrade to Pro/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I already have a key/ })).toBeInTheDocument();
  });

  it("Upgrade button opens the upgrade modal with context=generic", () => {
    render(<LicenseCard />);
    fireEvent.click(screen.getByRole("button", { name: /Upgrade to Pro/ }));
    expect(useAppStore.getState().upgradeModalOpen).toBe(true);
    expect(useAppStore.getState().upgradeModalContext).toBe("generic");
  });

  it("reveals paste field and shows error when activation fails", async () => {
    useAppStore.setState({
      activateLicense: vi.fn(async () => ({ ok: false, error: "bad key" })) as any,
    });
    render(<LicenseCard />);
    fireEvent.click(screen.getByRole("button", { name: /I already have a key/ }));
    const input = screen.getByLabelText(/License key/);
    fireEvent.change(input, { target: { value: "38b1460a-5104-4067-a91d-77b872934d51" } });
    fireEvent.click(screen.getByRole("button", { name: /Activate/ }));
    await waitFor(() => expect(screen.getByText(/bad key/)).toBeInTheDocument());
  });
});

describe("LicenseCard — pro state", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: {
        tier: "pro", email: "jane@example.com",
        activatedAt: Math.floor(Date.now() / 1000) - 2 * 86400,
        lastValidatedAt: Math.floor(Date.now() / 1000) - 1 * 86400,
      },
    });
  });

  it("shows the email, activated-at, and Deactivate button", () => {
    render(<LicenseCard />);
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check license now/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deactivate this machine/ })).toBeInTheDocument();
  });
});
