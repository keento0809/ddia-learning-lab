import { afterEach, describe, expect, it, vi } from "vitest";

describe("getEnabledOAuthProviders (T-005 #7: env-var gated OAuth visibility)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns no providers when no OAuth env vars are set", async () => {
    vi.stubEnv("GITHUB_ID", "");
    vi.stubEnv("GITHUB_SECRET", "");
    vi.stubEnv("GOOGLE_ID", "");
    vi.stubEnv("GOOGLE_SECRET", "");
    const { getEnabledOAuthProviders } = await import("@/lib/auth/providers");
    expect(getEnabledOAuthProviders()).toEqual([]);
  });

  it("requires both id and secret for a provider to be enabled", async () => {
    vi.stubEnv("GITHUB_ID", "some-id");
    vi.stubEnv("GITHUB_SECRET", "");
    vi.stubEnv("GOOGLE_ID", "");
    vi.stubEnv("GOOGLE_SECRET", "");
    const { getEnabledOAuthProviders } = await import("@/lib/auth/providers");
    expect(getEnabledOAuthProviders()).toEqual([]);
  });

  it("enables a provider once both its id and secret are set", async () => {
    vi.stubEnv("GITHUB_ID", "some-id");
    vi.stubEnv("GITHUB_SECRET", "some-secret");
    vi.stubEnv("GOOGLE_ID", "another-id");
    vi.stubEnv("GOOGLE_SECRET", "another-secret");
    const { getEnabledOAuthProviders } = await import("@/lib/auth/providers");
    expect(getEnabledOAuthProviders()).toEqual(["github", "google"]);
  });
});
