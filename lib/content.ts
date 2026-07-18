import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { ExerciseDefinitionSchema, type ExerciseDefinition } from "./contracts/exercise";
import type { Locale } from "./contracts/common";

/**
 * コンテンツパイプライン(ビルド時専用ローダ)。
 * 参照設計: docs/design/02_詳細設計書.md §1(ディレクトリ構成), §9(ビルドパイプライン)。
 *
 * node:fs に依存するため、Cloudflare Workersのリクエスト処理経路(workerd)には
 * 直接importしないこと。next buildの静的生成文脈またはNode CLIスクリプト
 * (scripts/validate-content.ts)からのみ使用する。T-000で
 * `next-mdx-remote` + リクエスト時 `fs.readFile` がwrangler preview環境で
 * `[unenv] fs.readFile is not implemented yet!` により失敗することが判明したための
 * 制約(docs/skeleton-notes.md参照)。
 */

export class ContentValidationError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
  ) {
    super(`${filePath}: ${message}`);
    this.name = "ContentValidationError";
  }
}

/**
 * module.yamlの最小スキーマ(T-006検証専用)。
 * 03文書T-101行は「module.yamlスキーマ(T-010の型)」を前提とするが、T-010の
 * 公式成果物にmodule.yaml定義は含まれず(STATUS.md 2026-07-18決定事項ログ)、
 * lib/contracts/は変更禁止(CLAUDE.md規則2)のため、ここではT-006自身の検証
 * (slug列挙・frontmatter必須項目)に必要な最小限の項目のみをローカルスキーマ
 * として定義する。T-101着手前に公式contract化するかの判断が別途必要。
 */
const ModuleMetaSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().positive(),
  minutes: z.number().positive(),
});
export type ModuleMeta = z.infer<typeof ModuleMetaSchema>;

/** レッスンMDXのfrontmatter必須項目(02§9「4. frontmatter必須項目 (title, order, minutes)」) */
const LessonFrontmatterSchema = z.object({
  title: z.string().min(1),
  order: z.number().int().positive(),
  minutes: z.number().positive(),
});
export type LessonFrontmatter = z.infer<typeof LessonFrontmatterSchema>;

export interface LessonEntry {
  /** "{moduleSlug}/{lessonBaseName}" 形式 */
  slug: string;
  filePath: string;
  frontmatter: LessonFrontmatter;
  body: string;
}

export interface ExerciseEntry {
  slug: string;
  filePath: string;
  definition: ExerciseDefinition;
}

export interface ModuleContent {
  slug: string;
  meta: ModuleMeta;
  metaFilePath: string;
  lessons: LessonEntry[];
  quizFilePath: string | null;
  exercises: ExerciseEntry[];
}

function readYaml(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return parseYaml(raw);
  } catch (err) {
    throw new ContentValidationError(
      `YAMLの解析に失敗しました: ${(err as Error).message}`,
      filePath,
    );
  }
}

const FRONTMATTER_BLOCK_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** MDX先頭の `---` ブロックをfrontmatterとして抽出する(remarkパイプラインを介さない軽量実装) */
function parseFrontmatter(
  raw: string,
  filePath: string,
): { data: unknown; body: string } {
  const match = FRONTMATTER_BLOCK_RE.exec(raw);
  if (!match) {
    return { data: {}, body: raw };
  }
  let data: unknown;
  try {
    data = parseYaml(match[1]);
  } catch (err) {
    throw new ContentValidationError(
      `frontmatterのYAML解析に失敗しました: ${(err as Error).message}`,
      filePath,
    );
  }
  return { data: data ?? {}, body: raw.slice(match[0].length) };
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join(", ");
}

/** content/{locale}/*配下でmodule.yamlを持つディレクトリ名(=モジュールslug)を列挙する */
export function listModuleSlugs(root: string, locale: Locale): string[] {
  const localeDir = path.join(root, locale);
  if (!fs.existsSync(localeDir)) return [];
  return fs
    .readdirSync(localeDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(localeDir, name, "module.yaml")))
    .sort();
}

/** 1モジュール分(module.yaml + レッスンMDX + quiz.yaml + labs/*.yaml)をロード・検証する */
export function loadModule(
  root: string,
  locale: Locale,
  moduleSlug: string,
): ModuleContent {
  const moduleDir = path.join(root, locale, moduleSlug);
  const metaFilePath = path.join(moduleDir, "module.yaml");
  const metaRaw = readYaml(metaFilePath);
  const metaResult = ModuleMetaSchema.safeParse(metaRaw);
  if (!metaResult.success) {
    throw new ContentValidationError(
      `module.yamlのfrontmatter必須項目(title, order, minutes)が不足/不正です: ${formatZodIssues(metaResult.error)}`,
      metaFilePath,
    );
  }

  const lessonFileNames = fs
    .readdirSync(moduleDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
    .map((entry) => entry.name)
    .sort();

  const lessons: LessonEntry[] = lessonFileNames.map((fileName) => {
    const filePath = path.join(moduleDir, fileName);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, body } = parseFrontmatter(raw, filePath);
    const fmResult = LessonFrontmatterSchema.safeParse(data);
    if (!fmResult.success) {
      throw new ContentValidationError(
        `frontmatter必須項目(title, order, minutes)が不足/不正です: ${formatZodIssues(fmResult.error)}`,
        filePath,
      );
    }
    return {
      slug: `${moduleSlug}/${fileName.replace(/\.mdx$/, "")}`,
      filePath,
      frontmatter: fmResult.data,
      body,
    };
  });

  const quizFilePath = path.join(moduleDir, "quiz.yaml");
  const hasQuiz = fs.existsSync(quizFilePath);
  if (hasQuiz) {
    // quiz.yamlの構造スキーマは未確定(STATUS.md 2026-07-18決定事項ログ、T-010参照)。
    // T-006では構文(YAMLとして解析可能か)のみ検証する。
    readYaml(quizFilePath);
  }

  const labsDir = path.join(moduleDir, "labs");
  const exercises: ExerciseEntry[] = fs.existsSync(labsDir)
    ? fs
        .readdirSync(labsDir, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")),
        )
        .map((entry) => entry.name)
        .sort()
        .map((fileName) => {
          const filePath = path.join(labsDir, fileName);
          const raw = readYaml(filePath);
          const result = ExerciseDefinitionSchema.safeParse(raw);
          if (!result.success) {
            throw new ContentValidationError(
              `演習YAMLのスキーマが不正です: ${formatZodIssues(result.error)}`,
              filePath,
            );
          }
          return { slug: result.data.slug, filePath, definition: result.data };
        })
    : [];

  return {
    slug: moduleSlug,
    meta: metaResult.data,
    metaFilePath,
    lessons,
    quizFilePath: hasQuiz ? quizFilePath : null,
    exercises,
  };
}

/** localeの全モジュールをロードする。1件でも読み込みエラーがあれば例外を投げる */
export function loadAllModules(root: string, locale: Locale): ModuleContent[] {
  return listModuleSlugs(root, locale).map((slug) => loadModule(root, locale, slug));
}
