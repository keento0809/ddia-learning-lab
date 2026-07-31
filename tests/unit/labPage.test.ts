import { describe, expect, it } from "vitest";
import { getModuleDetail } from "@/lib/moduleDetail";
import { buildLabPageData } from "@/lib/labPage";

/**
 * T-108r 受入基準(2)(4): content YAML(content/{ja,en}/**\/labs/*.yaml)から
 * exercise slugを解決するロジックの単体テスト。実content(05-replication、
 * T-006以降のパイプラインで既にビルド時生成済み)に対して検証する
 * (`lib/moduleDetail.ts`/`lib/labContent.ts`と同じ生成物を参照するため、
 * フィクスチャの複製は不要)。
 */
describe("buildLabPageData", () => {
  it("resolves the exercise definition for a real content exercise (ja)", () => {
    const detail = getModuleDetail("ja", "05-replication");
    expect(detail).toBeDefined();

    const data = buildLabPageData("ja", "05-replication", "quorum-lab", detail!);

    expect(data).toBeDefined();
    expect(data?.exercise.slug).toBe("05-replication/quorum-lab");
    expect(data?.exercise.language).toBe("js");
    expect(data?.exercise.entry).toBe("hasQuorumOverlap");
    expect(data?.index).toBe(1);
  });

  it("resolves the second exercise in the module with the correct 1-based index", () => {
    const detail = getModuleDetail("ja", "05-replication");
    const data = buildLabPageData("ja", "05-replication", "read-your-writes-lab", detail!);

    expect(data?.exercise.slug).toBe("05-replication/read-your-writes-lab");
    expect(data?.index).toBe(2);
  });

  it("resolves the same exercise in English with localized hint text", () => {
    const detail = getModuleDetail("en", "05-replication");
    const data = buildLabPageData("en", "05-replication", "quorum-lab", detail!);

    expect(data).toBeDefined();
    expect(data?.exercise.slug).toBe("05-replication/quorum-lab");
  });

  it("returns undefined for an unknown exercise segment within a real module", () => {
    const detail = getModuleDetail("ja", "05-replication");
    expect(buildLabPageData("ja", "05-replication", "does-not-exist-xyz", detail!)).toBeUndefined();
  });

  describe("nextHref (T-108e, 02§3.2 next-lesson CTA)", () => {
    it("points to the next exercise in the module TOC when one follows", () => {
      const detail = getModuleDetail("ja", "05-replication");
      const data = buildLabPageData("ja", "05-replication", "quorum-lab", detail!);

      expect(data?.nextHref).toBe("/learn/05-replication/lab/read-your-writes-lab");
    });

    it("falls back to the module detail page when this is the last TOC item", () => {
      const detail = getModuleDetail("ja", "05-replication");
      const data = buildLabPageData("ja", "05-replication", "read-your-writes-lab", detail!);

      expect(data?.nextHref).toBe("/learn/05-replication");
    });
  });
});
