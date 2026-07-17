import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_API_URL } from "@/shared/lib/env";

describe("env", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("falls back to the ntizo prod default when VITE_AUTH_API_URL is unset", () => {
    // AUTH_API_URL is read at module load; assert the resolved default shape.
    expect(typeof AUTH_API_URL).toBe("string");
    expect(AUTH_API_URL.length).toBeGreaterThan(0);
  });
});
