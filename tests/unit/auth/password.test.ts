import { describe, expect, it, vi, afterEach } from "vitest";
import { scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

describe("password hashing (T-005, ADR-007 C-3)", () => {
  afterEach(() => {
    vi.doUnmock("hash-wasm");
    vi.resetModules();
  });

  it("hashes with Argon2id by default and verifies correctly", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth/password");
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("falls back to scrypt when Argon2id (WASM) is unavailable", async () => {
    vi.doMock("hash-wasm", () => ({
      argon2id: vi.fn().mockRejectedValue(new Error("WASM instantiation failed")),
      argon2Verify: vi.fn().mockRejectedValue(new Error("WASM instantiation failed")),
    }));
    vi.resetModules();
    const { hashPassword, verifyPassword } = await import("@/lib/auth/password");

    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$scrypt$")).toBe(true);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("verifies a pre-existing scrypt hash without needing Argon2 to be unavailable", async () => {
    const { verifyPassword } = await import("@/lib/auth/password");
    const salt = Buffer.from("Q2hhbmdlTWVTYWx0MTIzNA==", "base64");
    const derivedKey = await scryptAsync("hunter2", salt, 32, { N: 16384, r: 8, p: 1 });
    const stored = `$scrypt$N=16384,r=8,p=1$${salt.toString("base64")}$${derivedKey.toString("base64")}`;

    await expect(verifyPassword("hunter2", stored)).resolves.toBe(true);
    await expect(verifyPassword("not-hunter2", stored)).resolves.toBe(false);
  });

  it("rejects a hash with an unrecognized format", async () => {
    const { verifyPassword } = await import("@/lib/auth/password");
    await expect(verifyPassword("anything", "$bcrypt$not-supported")).resolves.toBe(false);
  });
});
