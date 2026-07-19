import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { LocalizedTextSchema } from "./contracts/common";
import { ContentValidationError } from "./content";

/**
 * content/glossary.yaml(.claude/rules/i18n.md「用語はcontent/glossary.yamlを正とする」)の
 * ビルド時専用ローダ。lib/content.tsと同じ理由(node:fs依存)で、Cloudflare Workersの
 * リクエスト処理経路には直接importせず、next buildの静的生成文脈またはNode CLI
 * スクリプト(scripts/generate-curriculum.ts)からのみ使用する。
 *
 * <Term>(T-103, 02§4.1)の描画に必要な最小スキーマをここにローカル定義する。
 * lib/contracts/module.tsがT-006時点で辿った経路(公式contract未確定の間は
 * 呼び出し元モジュールにローカル定義し、契約確定タスクで昇格する)と同じ扱い。
 */
const GlossaryEntrySchema = z.object({
  slug: z.string().min(1),
  term: LocalizedTextSchema,
  definition: LocalizedTextSchema,
});
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join(", ");
}

/**
 * content/glossary.yamlをロードする。ファイルが存在しない場合は空配列を返す
 * (T-110/T-111着手前の現時点では用語集コンテンツ自体が存在しないため、
 * T-101/T-102が「content/配下に実カリキュラム教材が存在しない」場合に
 * 空状態を描画する既存判断と同じ扱い)。
 */
export function loadGlossary(root: string): GlossaryEntry[] {
  const filePath = path.join(root, "glossary.yaml");
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new ContentValidationError(
      `YAMLの解析に失敗しました: ${(err as Error).message}`,
      filePath,
    );
  }

  const result = z.array(GlossaryEntrySchema).safeParse(parsed ?? []);
  if (!result.success) {
    throw new ContentValidationError(
      `glossary.yamlのスキーマが不正です: ${formatZodIssues(result.error)}`,
      filePath,
    );
  }
  return result.data;
}
