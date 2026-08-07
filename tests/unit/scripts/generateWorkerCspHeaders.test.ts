import { describe, expect, it } from "vitest";
import {
  WORKER_TARGETS,
  resolveWorkerChunkFile,
  buildHeaderBlock,
  buildHeadersOutput,
} from "../../../scripts/generate-worker-csp-headers.mjs";

/**
 * T-704: scripts/generate-worker-csp-headers.mjsのマーカー解決ロジック
 * (実ファイルI/Oなしの回帰テスト、実際の.open-next/assets/に対する動作確認は
 * `npm run preview`の実ビルドで別途検証済み)。
 */
describe("resolveWorkerChunkFile", () => {
  it("マーカー文字列を含む唯一のファイルを返す", () => {
    const files = ["a.js", "b.js", "c.js"];
    const contents: Record<string, string> = {
      "a.js": "unrelated code",
      "b.js": "some code with 禁止された構文が含まれています inside",
      "c.js": "other unrelated code",
    };
    const result = resolveWorkerChunkFile(
      { name: "JS runner", marker: "禁止された構文が含まれています" },
      files,
      (f: string) => contents[f],
    );
    expect(result).toBe("b.js");
  });

  it("マーカーが0件のときthrowする(サイレントスキップしない)", () => {
    const files = ["a.js"];
    expect(() =>
      resolveWorkerChunkFile({ name: "JS runner", marker: "存在しない文字列" }, files, () => "x"),
    ).toThrow(/見つかりません/);
  });

  it("マーカーが複数件マッチしたらthrowする(一意特定できない場合に誤ったファイルへ適用しない)", () => {
    const files = ["a.js", "b.js"];
    expect(() =>
      resolveWorkerChunkFile({ name: "JS runner", marker: "shared" }, files, () => "has shared marker"),
    ).toThrow(/複数ファイルにマッチ/);
  });

  it("WORKER_TARGETSの3件それぞれのマーカーが互いに他のCSPペイロード文字列と衝突しない", () => {
    // findings.md SB-9/10/11: 3つのWorkerは互いに異なるCSPを適用するため、
    // マーカーが誤って別Workerのチャンクにもマッチすると誤ったCSPが適用される。
    const markers = WORKER_TARGETS.map((t) => t.marker);
    expect(new Set(markers).size).toBe(markers.length);
  });
});

describe("buildHeaderBlock / buildHeadersOutput", () => {
  it("`_headers`のパス行+ヘッダ行を1ブロックとして組み立てる", () => {
    const block = buildHeaderBlock("3464.abc.js", "default-src 'none'");
    expect(block).toBe("/_next/static/chunks/3464.abc.js\n  Content-Security-Policy: default-src 'none'");
  });

  it("既存の_headers内容が空なら生成分のみを出力する", () => {
    const output = buildHeadersOutput("", ["BLOCK_A", "BLOCK_B"]);
    expect(output).toBe("BLOCK_A\n\nBLOCK_B\n");
  });

  it("既存の_headers内容があれば末尾に追記する(他タスクが書いた既存ルールを破壊しない)", () => {
    const output = buildHeadersOutput("/foo\n  X-Existing: 1\n", ["BLOCK_A"]);
    expect(output).toBe("/foo\n  X-Existing: 1\n\nBLOCK_A\n");
  });
});
