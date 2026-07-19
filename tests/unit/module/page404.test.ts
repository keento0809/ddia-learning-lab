import { describe, expect, it } from "vitest";
import ModuleDetailPage from "@/app/[locale]/learn/[module]/page";

/**
 * 03文書T-102 受入基準「存在しないslugで404」。
 * Next.jsのnotFound()は`digest: "NEXT_HTTP_ERROR_FALLBACK;404"`を持つ例外を
 * 投げてレンダリングパイプラインに404を伝える(node_modules/next/dist/client/
 * components/not-found.js)。ページ関数を直接呼び出し、この例外が伝播することを検証する。
 */
describe("ModuleDetailPage", () => {
  it("throws Next.js's notFound() (digest NEXT_HTTP_ERROR_FALLBACK;404) for an unknown module slug", async () => {
    await expect(
      ModuleDetailPage({
        params: Promise.resolve({ locale: "ja", module: "does-not-exist-xyz" }),
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
