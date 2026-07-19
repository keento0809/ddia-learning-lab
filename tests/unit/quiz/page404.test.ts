import { describe, expect, it } from "vitest";
import QuizPage from "@/app/[locale]/learn/[module]/quiz/page";

/**
 * T-106。存在しないmodule slugへのアクセスはnotFound()(404)を返すこと。
 * module.tsx page404.test.tsと同じ検証パターン(`digest`)を用いる。
 * 未知slugの場合はモジュール探索がauth()呼び出しより先に失敗するため、
 * DB接続をモックせずに検証できる。
 */
describe("QuizPage", () => {
  it("throws Next.js's notFound() (digest NEXT_HTTP_ERROR_FALLBACK;404) for an unknown module slug", async () => {
    await expect(
      QuizPage({
        params: Promise.resolve({ locale: "ja", module: "does-not-exist-xyz" }),
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
