import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAppStore } from "./app";

vi.mock("@/lib/licenseApi", () => ({
  licenseApi: {
    activate:         vi.fn(),
    status:           vi.fn(),
    deactivate:       vi.fn(),
    revalidate:       vi.fn(),
    shouldRevalidate: vi.fn(),
  },
}));

import { licenseApi } from "@/lib/licenseApi";

describe("license slice", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
    });
    vi.resetAllMocks();
  });

  it("defaults to free", () => {
    const { result } = renderHook(() => useAppStore((s) => s.license));
    expect(result.current.tier).toBe("free");
  });

  it("activate() success updates slice to pro", async () => {
    (licenseApi.activate as any).mockResolvedValue({
      tier: "pro", email: "jane@example.com",
      activated_at: 123, last_validated_at: 123,
    });

    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      const res = await result.current.activateLicense("38b1460a-5104-4067-a91d-77b872934d51");
      expect(res.ok).toBe(true);
    });
    expect(result.current.license.tier).toBe("pro");
    expect(result.current.license.email).toBe("jane@example.com");
  });

  it("activate() failure returns ok=false with error, slice unchanged", async () => {
    (licenseApi.activate as any).mockRejectedValue("limit reached");
    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      const res = await result.current.activateLicense("38b1460a-5104-4067-a91d-77b872934d51");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("limit");
    });
    expect(result.current.license.tier).toBe("free");
  });

  it("deactivate() clears slice", async () => {
    useAppStore.setState({
      license: { tier: "pro", email: "x", activatedAt: 1, lastValidatedAt: 1 },
    });
    (licenseApi.deactivate as any).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAppStore());
    await act(async () => { await result.current.deactivateLicense(); });
    expect(result.current.license.tier).toBe("free");
    expect(result.current.license.email).toBeNull();
  });
});
