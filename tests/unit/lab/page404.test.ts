import { describe, expect, it, vi } from "vitest";
import LabPage from "@/app/[locale]/learn/[module]/lab/[exercise]/page";

/**
 * T-108r 受入基準(4)「存在しないexercise slugで404」。
 * `tests/unit/module/page404.test.ts`/`tests/unit/quiz/page404.test.ts`と
 * 同じ検証パターン(notFound()のdigest)を用いる。
 *
 * T-108e: `LabPage`が`auth()`(02§3.2「合格時にPUT progress」向けの
 * isAuthenticated判定)を呼ぶようになったため、`auth()`本体(next-authの
 * `headers()`呼び出しがリクエストスコープ外で失敗する)を最小限モックする
 * (`tests/integration/setup.ts`等、既存の統合テストと同じ方針)。
 */
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn().mockResolvedValue(null) }));
describe("LabPage", () => {
  it("throws Next.js's notFound() for an unknown module slug", async () => {
    await expect(
      LabPage({
        params: Promise.resolve({
          locale: "ja",
          module: "does-not-exist-xyz",
          exercise: "quorum-lab",
        }),
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("throws Next.js's notFound() for an unknown exercise slug within a real module", async () => {
    await expect(
      LabPage({
        params: Promise.resolve({
          locale: "ja",
          module: "05-replication",
          exercise: "does-not-exist-xyz",
        }),
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("throws Next.js's notFound() for an unsupported locale", async () => {
    await expect(
      LabPage({
        params: Promise.resolve({
          locale: "fr",
          module: "05-replication",
          exercise: "quorum-lab",
        }),
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("resolves a valid element for a real exercise (mounted LabWorkspace, not notFound())", async () => {
    const element = await LabPage({
      params: Promise.resolve({
        locale: "ja",
        module: "05-replication",
        exercise: "quorum-lab",
      }),
    });

    expect(element.props.exercise.slug).toBe("05-replication/quorum-lab");
    expect(element.props.locale).toBe("ja");
    expect(element.props.isAuthenticated).toBe(false);
    expect(element.props.nextHref).toBe("/learn/05-replication/lab/read-your-writes-lab");
  });
});
