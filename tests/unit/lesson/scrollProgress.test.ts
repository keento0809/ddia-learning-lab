import { describe, expect, it } from "vitest";
import { computeScrollProgress, hasReachedThreshold } from "@/lib/lesson/scrollProgress";

describe("computeScrollProgress", () => {
  it("記事の先頭でスクロールしていない場合は0に近い値を返す", () => {
    const progress = computeScrollProgress({
      scrollY: 0,
      viewportHeight: 800,
      articleTop: 200,
      articleHeight: 4000,
    });
    expect(progress).toBeCloseTo(600 / 4000);
  });

  it("記事全体を読み切った場合は1(上限)を返す", () => {
    const progress = computeScrollProgress({
      scrollY: 5000,
      viewportHeight: 800,
      articleTop: 200,
      articleHeight: 4000,
    });
    expect(progress).toBe(1);
  });

  it("記事が画面より前(articleTopが負)でも0未満にはならない(下限クランプ)", () => {
    const progress = computeScrollProgress({
      scrollY: 0,
      viewportHeight: 800,
      articleTop: -5000,
      articleHeight: 4000,
    });
    expect(progress).toBe(1);
  });

  it("記事の高さが0以下の場合は1を返す(空コンテンツで無限ループしない)", () => {
    expect(
      computeScrollProgress({ scrollY: 0, viewportHeight: 800, articleTop: 0, articleHeight: 0 }),
    ).toBe(1);
  });

  it("80%地点でちょうど閾値に到達する", () => {
    const progress = computeScrollProgress({
      scrollY: 3000,
      viewportHeight: 200,
      articleTop: 0,
      articleHeight: 4000,
    });
    expect(progress).toBeCloseTo(0.8);
  });
});

describe("hasReachedThreshold", () => {
  it("進捗が閾値以上であればtrue", () => {
    expect(hasReachedThreshold(0.8, 0.8)).toBe(true);
    expect(hasReachedThreshold(0.9, 0.8)).toBe(true);
  });

  it("進捗が閾値未満であればfalse", () => {
    expect(hasReachedThreshold(0.79, 0.8)).toBe(false);
  });
});
