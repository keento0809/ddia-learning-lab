import { describe, expect, it, vi, type Mock } from "vitest";
import LabPage from "@/app/[locale]/learn/[module]/lab/[exercise]/page";
import { auth } from "@/lib/auth/config";

type SessionLike = { user: { id: string }; expires: string } | null;
const mockedAuth = auth as unknown as Mock<(...args: unknown[]) => Promise<SessionLike>>;

/**
 * T-108r 受入基準(4)「存在しないexercise slugで404」。
 * `tests/unit/module/page404.test.ts`/`tests/unit/quiz/page404.test.ts`と
 * 同じ検証パターン(notFound()のdigest)を用いる。
 *
 * T-108e: `LabPage`が`auth()`(02§3.2「合格時にPUT progress」向けの
 * isAuthenticated判定)を呼ぶようになったため、`auth()`本体(next-authの
 * `headers()`呼び出しがリクエストスコープ外で失敗する)を最小限モックする
 * (`tests/integration/setup.ts`等、既存の統合テストと同じ方針)。
 *
 * T-604(ADR-009 §5層1・§6): 「モジュール1以外の演習はGated」となったため、
 * 「実在する演習で有効な要素が得られる」ケースは認証済みセッションで検証する
 * (未認証・Gated時の挙動はtests/unit/lab/accessGate.test.tsが専用に検証する)。
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
    mockedAuth.mockResolvedValueOnce({
      user: { id: "user-1" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    const element = await LabPage({
      params: Promise.resolve({
        locale: "ja",
        module: "05-replication",
        exercise: "quorum-lab",
      }),
    });

    expect(element.props.exercise.slug).toBe("05-replication/quorum-lab");
    expect(element.props.locale).toBe("ja");
    expect(element.props.isAuthenticated).toBe(true);
    expect(element.props.nextHref).toBe("/learn/05-replication/lab/read-your-writes-lab");
  });
});
