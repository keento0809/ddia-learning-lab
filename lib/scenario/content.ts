import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { ScenarioDefinitionSchema, type ScenarioDefinition } from "@/lib/scenario/schema";
import { ContentValidationError } from "@/lib/content";

/**
 * content/scenario-capstone.yaml(T-302)のビルド時専用ローダ。
 * lib/glossaryContent.ts(content/glossary.yaml)と同じ理由(node:fs依存)で、
 * Cloudflare Workersのリクエスト処理経路には直接importせず、next buildの
 * 静的生成文脈またはNode CLIスクリプト(scripts/generate-curriculum.ts)からのみ
 * 使用する。ページ側はビルド時生成物を経由するlib/scenario.tsを使う。
 */

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join(", ");
}

/** content/scenario-capstone.yamlをロード・検証する */
export function loadScenario(root: string): ScenarioDefinition {
  const filePath = path.join(root, "scenario-capstone.yaml");
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

  const result = ScenarioDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    throw new ContentValidationError(
      `scenario-capstone.yamlのスキーマが不正です: ${formatZodIssues(result.error)}`,
      filePath,
    );
  }
  return result.data;
}
