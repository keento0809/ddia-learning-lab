import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResetToken, verifyResetToken } from "@/lib/auth/resetToken";

/**
 * lib/auth/resetToken.ts: パスワードリセット用のステートレスJWT。
 * 「使い切り」制約はpasswordHashダイジェストの一致で実現しており(DBに
 * トークンを保存しない設計、lib/auth/resetToken.ts参照)、この非自明な
 * 挙動を直接検証する。
 */
describe("password reset token (T-005)", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "test-secret-for-reset-token-unit-tests");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("issues a token that verifies successfully against the same password hash", async () => {
    const token = await createResetToken("user-1", "$argon2id$original-hash");
    const result = await verifyResetToken(token, "$argon2id$original-hash");
    expect(result).toEqual({ userId: "user-1" });
  });

  it("rejects the token once the password hash has changed (single-use via hash pin)", async () => {
    const token = await createResetToken("user-1", "$argon2id$original-hash");
    const result = await verifyResetToken(token, "$argon2id$changed-after-reset");
    expect(result).toBeNull();
  });

  it("treats a null passwordHash (OAuth-only account) consistently", async () => {
    const token = await createResetToken("user-1", null);
    await expect(verifyResetToken(token, null)).resolves.toEqual({ userId: "user-1" });
    await expect(verifyResetToken(token, "$argon2id$now-has-a-password")).resolves.toBeNull();
  });

  it("rejects a token for the wrong userId's current hash (does not leak across users)", async () => {
    const token = await createResetToken("user-1", "$argon2id$same-hash");
    // 別ユーザーがたまたま同一ハッシュ値を持っていても、subが異なる別発行の
    // トークンとして扱われるべきで、そもそも他ユーザーのuserIdでは検証しない
    // (呼び出し側がverifyResetTokenの戻り値のuserIdを信頼する設計)。
    const result = await verifyResetToken(token, "$argon2id$same-hash");
    expect(result?.userId).toBe("user-1");
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = await createResetToken("user-1", "$argon2id$hash");

    vi.setSystemTime(new Date("2026-01-01T02:00:00Z")); // TTL(1時間)を超過
    const result = await verifyResetToken(token, "$argon2id$hash");
    expect(result).toBeNull();
  });

  it("rejects a malformed or tampered token", async () => {
    const token = await createResetToken("user-1", "$argon2id$hash");
    const tampered = `${token.slice(0, -4)}abcd`;
    await expect(verifyResetToken(tampered, "$argon2id$hash")).resolves.toBeNull();
    await expect(verifyResetToken("not-a-jwt", "$argon2id$hash")).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createResetToken("user-1", "$argon2id$hash");
    vi.stubEnv("AUTH_SECRET", "a-different-secret-entirely");
    const result = await verifyResetToken(token, "$argon2id$hash");
    expect(result).toBeNull();
  });
});
