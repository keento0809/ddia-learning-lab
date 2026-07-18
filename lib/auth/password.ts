import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { argon2id, argon2Verify } from "hash-wasm";

/**
 * パスワードハッシュ化。02§2.1 users.password_hash / ADR-007 C-3。
 * 既定はArgon2id(hash-wasmの純WASM実装、workerdでもネイティブアドオン不要で動作)。
 * WASM初期化・実行が失敗する環境でのみscrypt(node:crypto、Cloudflare Workersは
 * nodejs_compatフラグで提供)へフォールバックする。生成した文字列の先頭タグ
 * ($argon2id$ / $scrypt$)で検証時に使用アルゴリズムを判別する(capabilityの
 * 再判定は不要)。
 */

const scryptAsync = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const ARGON2ID_PREFIX = "$argon2id$";
const SCRYPT_PREFIX = "$scrypt$";

const ARGON2_PARAMS = {
  // OWASP Password Storage Cheat Sheetのargon2id最小推奨値(m=19MiB, t=2, p=1)を
  // 踏襲しつつ反復回数のみ3に強化。
  iterations: 3,
  parallelism: 1,
  memorySize: 19456,
  hashLength: 32,
} as const;

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLength: 32 } as const;

export async function hashPassword(password: string): Promise<string> {
  try {
    return await argon2id({
      password,
      salt: randomBytes(16),
      ...ARGON2_PARAMS,
      outputType: "encoded",
    });
  } catch {
    return hashWithScrypt(password);
  }
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (storedHash.startsWith(ARGON2ID_PREFIX)) {
    return argon2Verify({ password, hash: storedHash });
  }
  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    return verifyWithScrypt(password, storedHash);
  }
  return false;
}

async function hashWithScrypt(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  const params = `N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}`;
  return `${SCRYPT_PREFIX}${params}$${salt.toString("base64")}$${derivedKey.toString("base64")}`;
}

async function verifyWithScrypt(password: string, storedHash: string): Promise<boolean> {
  const body = storedHash.slice(SCRYPT_PREFIX.length);
  const [paramsPart, saltB64, hashB64] = body.split("$");
  if (!paramsPart || !saltB64 || !hashB64) {
    return false;
  }
  const params = Object.fromEntries(
    paramsPart.split(",").map((entry) => entry.split("=")),
  ) as Record<string, string>;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const derivedKey = await scryptAsync(password, salt, expected.length, {
    N: Number(params.N),
    r: Number(params.r),
    p: Number(params.p),
  });
  return derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected);
}
