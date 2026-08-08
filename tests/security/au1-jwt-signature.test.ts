import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { encode } from "@auth/core/jwt";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/workers/api/src/auth";
import { createResetToken, verifyResetToken } from "@/lib/auth/resetToken";
import { SECURITY_TEST_AUTH_SECRET } from "./helpers/workerApi";

/**
 * T-703 AU-1(docs/design/11_ADR-011 §3.2)。JWTの署名検証。
 *
 * このアプリには2種類のJWTが存在する:
 *  (a) セッションCookie(authjs.session-token): Auth.js/@auth/core/jwtの
 *      encode/decodeが発行・検証するJWE(暗号化トークン)。workers/api/src/auth.ts
 *      が唯一の検証経路(requireSessionミドルウェア、../index.ts)。
 *  (b) パスワードリセットトークン: lib/auth/resetToken.tsが`jose`のSignJWT/jwtVerifyで
 *      直接署名・検証する平文JWS(HS256)。alg:none・アルゴリズム混同の標準的な
 *      攻撃対象になり得るのはこちら。
 *
 * (a)はJWE(暗号化)であり、攻撃者はヘッダ/ペイロードを一切観測できないため
 * alg:none・アルゴリズム混同は構造的に成立しない(復号鍵を知らない限りCEKも
 * IVも改変できない)。念のため「1バイトでも改変されたら必ず拒否される」ことを
 * 検証する。
 */
describe("AU-1: JWT署名検証", () => {
  describe("(a) セッションCookie(JWE, workers/api/src/auth.ts)", () => {
    it("正規に発行したセッションCookieは検証を通過する", async () => {
      const userId = "user-au1-valid";
      const token = await encode({ token: { uid: userId }, secret: SECURITY_TEST_AUTH_SECRET, salt: SESSION_COOKIE_NAME });
      const result = await verifySessionCookie(`${SESSION_COOKIE_NAME}=${token}`, SECURITY_TEST_AUTH_SECRET);
      expect(result).toEqual({ userId });
    });

    it("暗号文(ciphertext)部分が改ざんされたCookie値は拒否される(JWEの改ざん耐性)", async () => {
      const token = await encode({ token: { uid: "user-au1-tamper" }, secret: SECURITY_TEST_AUTH_SECRET, salt: SESSION_COOKIE_NAME });
      // JWE compact serializationは`header.encryptedKey.iv.ciphertext.tag`の5パート。
      // 末尾1文字はbase64urlのパディング境界上、未使用ビットのみを変更してしまう
      // 場合がありデコード結果が変わらない(=改ざんが検出できたテストにならない)
      // ため、ciphertext部分(4番目のパート)の先頭付近を改ざんする。
      const parts = token.split(".");
      expect(parts.length).toBe(5);
      const ciphertext = parts[3];
      const flippedChar = ciphertext[0] === "a" ? "b" : "a";
      parts[3] = flippedChar + ciphertext.slice(1);
      const tampered = parts.join(".");
      expect(tampered).not.toBe(token);

      const result = await verifySessionCookie(`${SESSION_COOKIE_NAME}=${tampered}`, SECURITY_TEST_AUTH_SECRET);
      expect(result).toBeNull();
    });

    it("平文JSON({\"uid\":\"attacker\"})をJWTのふりをして渡しても拒否される(alg:none相当の攻撃)", async () => {
      const fakeToken = Buffer.from(JSON.stringify({ uid: "attacker" })).toString("base64url");
      const result = await verifySessionCookie(`${SESSION_COOKIE_NAME}=${fakeToken}`, SECURITY_TEST_AUTH_SECRET);
      expect(result).toBeNull();
    });

    it("自前でHS256署名した3パートJWT(alg:HS256, uid:attacker)を渡しても拒否される(鍵の取り違え/アルゴリズム混同)", async () => {
      // セッションCookieはJWE(dir/A256GCM)を期待する検証器に、平文JWS(HS256)を
      // 渡す攻撃。decode()がJWEとしてのcompactDecryptに失敗し拒否されることを確認する。
      const forged = await new SignJWT({ uid: "attacker" })
        .setProtectedHeader({ alg: "HS256" })
        .sign(new TextEncoder().encode(SECURITY_TEST_AUTH_SECRET));
      const result = await verifySessionCookie(`${SESSION_COOKIE_NAME}=${forged}`, SECURITY_TEST_AUTH_SECRET);
      expect(result).toBeNull();
    });

    it("異なるsecretで発行されたCookie(鍵の取り違え)は拒否される", async () => {
      const token = await encode({ token: { uid: "user-au1-wrongkey" }, secret: "attacker-controlled-secret-value", salt: SESSION_COOKIE_NAME });
      const result = await verifySessionCookie(`${SESSION_COOKIE_NAME}=${token}`, SECURITY_TEST_AUTH_SECRET);
      expect(result).toBeNull();
    });

    it("uidクレームが文字列でないトークンは拒否される(型混同)", async () => {
      const token = await encode({ token: { uid: { $ne: null } } as never, secret: SECURITY_TEST_AUTH_SECRET, salt: SESSION_COOKIE_NAME });
      const result = await verifySessionCookie(`${SESSION_COOKIE_NAME}=${token}`, SECURITY_TEST_AUTH_SECRET);
      expect(result).toBeNull();
    });
  });

  describe("(b) パスワードリセットトークン(平文JWS, lib/auth/resetToken.ts)", () => {
    const currentPasswordHash = "$argon2id$dummy-hash-for-au1";

    it("正規に発行したトークンは検証を通過する", async () => {
      const token = await createResetToken("user-1", currentPasswordHash, SECURITY_TEST_AUTH_SECRET);
      const result = await verifyResetToken(token, currentPasswordHash, SECURITY_TEST_AUTH_SECRET);
      expect(result).toEqual({ userId: "user-1" });
    });

    it("alg:noneに書き換え、署名を空にしたトークンは拒否される", async () => {
      const validToken = await createResetToken("user-1", currentPasswordHash, SECURITY_TEST_AUTH_SECRET);
      const [, payloadB64] = validToken.split(".");
      const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const forged = `${noneHeader}.${payloadB64}.`;
      const result = await verifyResetToken(forged, currentPasswordHash, SECURITY_TEST_AUTH_SECRET);
      expect(result).toBeNull();
    });

    it("alg:HS384/HS512へ書き換えたヘッダは拒否される(アルゴリズム混同)", async () => {
      const validToken = await createResetToken("user-1", currentPasswordHash, SECURITY_TEST_AUTH_SECRET);
      const [, payloadB64, sigB64] = validToken.split(".");
      for (const alg of ["HS384", "HS512"]) {
        const rewrittenHeader = Buffer.from(JSON.stringify({ alg, typ: "JWT" })).toString("base64url");
        const forged = `${rewrittenHeader}.${payloadB64}.${sigB64}`;
        const result = await verifyResetToken(forged, currentPasswordHash, SECURITY_TEST_AUTH_SECRET);
        expect(result).toBeNull();
      }
    });

    it("別の秘密鍵(攻撃者が推測/自称する値)で署名したトークンは拒否される", async () => {
      const forged = await new SignJWT({ purpose: "password-reset", pwd: createHash("sha256").update(currentPasswordHash).digest("hex") })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("user-1")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode("attacker-guessed-secret"));
      const result = await verifyResetToken(forged, currentPasswordHash, SECURITY_TEST_AUTH_SECRET);
      expect(result).toBeNull();
    });

    it("有効期限切れのトークンは拒否される", async () => {
      const expired = await new SignJWT({ purpose: "password-reset", pwd: createHash("sha256").update(currentPasswordHash).digest("hex") })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("user-1")
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(new TextEncoder().encode(SECURITY_TEST_AUTH_SECRET));
      const result = await verifyResetToken(expired, currentPasswordHash, SECURITY_TEST_AUTH_SECRET);
      expect(result).toBeNull();
    });

    it("パスワード変更後は旧トークン(pwdクレームが古いダイジェスト)を再利用できない(使い切り制約)", async () => {
      const token = await createResetToken("user-1", currentPasswordHash, SECURITY_TEST_AUTH_SECRET);
      const result = await verifyResetToken(token, "$argon2id$a-different-hash-after-reset", SECURITY_TEST_AUTH_SECRET);
      expect(result).toBeNull();
    });
  });
});
