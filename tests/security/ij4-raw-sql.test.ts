import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T-703 IJ-4(docs/design/11_ADR-011 §3.3)。SQLインジェクション: Prisma使用のため
 * 低リスクだが、生SQL($queryRaw等)の有無を確認する。
 *
 * リポジトリ全体(node_modules/.git/.next/lib/generated等のビルド生成物・依存を
 * 除く)を対象に、Prismaの生SQL API($queryRaw/$executeRaw/queryRawUnsafe/
 * executeRawUnsafe)の使用箇所をgrepし、このテストファイル自身の文字列リテラル
 * 以外に一致がないことを確認する(=全DBアクセスがPrismaの型付きクエリビルダ
 * 経由であることの回帰防止)。
 */
describe("IJ-4: 生SQL($queryRaw/$executeRaw)使用箇所の有無", () => {
  const repoRoot = path.resolve(__dirname, "../..");
  const patterns = ["\\$queryRaw", "\\$executeRaw", "queryRawUnsafe", "executeRawUnsafe"];

  it("$queryRaw/$executeRaw/queryRawUnsafe/executeRawUnsafeはこのテストファイル以外に出現しない", () => {
    // アプリケーションコードのみを対象とする。lib/generated/**はPrisma自身が
    // 生成する型定義(doc-comment例やメソッドシグネチャに$queryRaw等の文字列が
    // 現れるのは、Prismaクライアントがそのメソッドを"公開している"事実であって
    // アプリ側が呼び出している証拠ではない)ため対象外とする(IJ-4の主眼である
    // 「アプリコードが生SQL APIを実際に呼んでいないか」に集中する)。
    // 注: --exclude-dirはディレクトリのbasenameのみに一致するパスグロブではない
    // (`lib/generated`のようなスラッシュ入りパスは一致しない)ため、対象を
    // アプリケーションのソースディレクトリに限定する方式にする。
    const targetDirs = ["app", "components", "lib", "workers/api/src", "prisma", "scripts"];

    for (const pattern of patterns) {
      let output = "";
      try {
        output = execFileSync(
          "grep",
          [
            "-rn",
            "--include=*.ts",
            "--include=*.tsx",
            "-E",
            pattern,
            ...targetDirs,
            "--exclude-dir=generated",
          ],
          { cwd: repoRoot, encoding: "utf-8" },
        );
      } catch (error) {
        // grepは非一致(exit 1)でも例外を投げるため、その場合は出力なし=OK。
        const execError = error as { status?: number; stdout?: string };
        if (execError.status !== 1) throw error;
        output = execError.stdout ?? "";
      }

      const matchingLines = output
        .split("\n")
        .filter((line) => line.length > 0)
        .filter((line) => !line.startsWith("tests/security/"));

      expect(matchingLines, `パターン "${pattern}" の一致箇所: ${matchingLines.join("\n")}`).toEqual([]);
    }
  });
});
