import { describe, expect, it } from "vitest";
import LessonPage from "@/app/[locale]/learn/[module]/[lesson]/page";

/**
 * T-103: 存在しないモジュール/レッスンでnotFound()(digest NEXT_HTTP_ERROR_FALLBACK;404)
 * が投げられることを確認する(T-102のpage404.test.tsと同じパターン)。
 * content/配下に実カリキュラム教材が存在しない現時点では、あらゆるmodule/lessonの
 * 組み合わせが「存在しない」ため、この経路が実質的に唯一のライブ動作となる。
 */
describe("LessonPage", () => {
  it("throws Next.js's notFound() for an unknown module slug", async () => {
    await expect(
      LessonPage({
        params: Promise.resolve({
          locale: "ja",
          module: "does-not-exist-xyz",
          lesson: "01-intro",
        }),
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("throws Next.js's notFound() for an unknown lesson id within an existing locale", async () => {
    await expect(
      LessonPage({
        params: Promise.resolve({
          locale: "en",
          module: "does-not-exist-xyz",
          lesson: "does-not-exist-either",
        }),
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
