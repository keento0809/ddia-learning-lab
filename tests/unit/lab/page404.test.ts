import { describe, expect, it } from "vitest";
import LabPage from "@/app/[locale]/learn/[module]/lab/[exercise]/page";

/**
 * T-108r 受入基準(4)「存在しないexercise slugで404」。
 * `tests/unit/module/page404.test.ts`/`tests/unit/quiz/page404.test.ts`と
 * 同じ検証パターン(notFound()のdigest)を用いる。
 */
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
  });
});
