import { describe, expect, it } from "vitest";
import {
  isSupportedGraderVersion,
  parseGraderVersion,
  SUPPORTED_GRADER_MAJOR_VERSIONS,
} from "@/lib/submissions/graderVersion";

describe("parseGraderVersion", () => {
  it("semver形式(major.minor.patch)を解析できる", () => {
    expect(parseGraderVersion("1.3.0")).toEqual({ major: 1, minor: 3, patch: 0 });
    expect(parseGraderVersion("0.0.0")).toEqual({ major: 0, minor: 0, patch: 0 });
    expect(parseGraderVersion("10.20.30")).toEqual({ major: 10, minor: 20, patch: 30 });
  });

  it.each([
    ["空文字", ""],
    ["メジャーのみ", "1"],
    ["メジャー.マイナーのみ", "1.3"],
    ["先頭にvが付く", "v1.3.0"],
    ["プレリリース付き", "1.3.0-beta"],
    ["負の数", "-1.3.0"],
    ["数値以外を含む", "a.b.c"],
    ["末尾ドット", "1.3.0."],
  ])("不正な形式(%s)はnullを返す: %s", (_label, input) => {
    expect(parseGraderVersion(input)).toBeNull();
  });
});

describe("isSupportedGraderVersion", () => {
  it("サポート対象メジャーバージョンならtrue", () => {
    for (const major of SUPPORTED_GRADER_MAJOR_VERSIONS) {
      expect(isSupportedGraderVersion(`${major}.0.0`)).toBe(true);
      expect(isSupportedGraderVersion(`${major}.9.9`)).toBe(true);
    }
  });

  it("サポート対象外のメジャーバージョンはfalse", () => {
    const unsupportedMajor = Math.max(...SUPPORTED_GRADER_MAJOR_VERSIONS) + 1;
    expect(isSupportedGraderVersion(`${unsupportedMajor}.0.0`)).toBe(false);
    expect(isSupportedGraderVersion("0.9.9")).toBe(false);
  });

  it("形式が不正な場合はfalse", () => {
    expect(isSupportedGraderVersion("not-a-version")).toBe(false);
    expect(isSupportedGraderVersion("")).toBe(false);
  });
});
