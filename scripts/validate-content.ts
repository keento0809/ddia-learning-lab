import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ContentValidationError,
  listModuleSlugs,
  loadModule,
  type ExerciseEntry,
  type LessonEntry,
  type ModuleContent,
} from "../lib/content";
import type { Locale } from "../lib/contracts/common";
import {
  SlugManifestSchema,
  type SlugManifest,
  type SlugManifestEntry,
} from "../lib/contracts/manifest";

/**
 * コンテンツ検証パイプライン(02§9 / 03文書T-006行)。
 *
 * 検証項目:
 *  1. ja/en slug集合の一致(モジュール/レッスン/quiz/演習)
 *  2. 演習YAMLのtestsハッシュ両言語一致
 *  3. MDXのリンク切れ検査(content/配下の相対参照のみ。外部URL/絶対パスの
 *     アプリルートは対象外 — アプリルート構造はT-101以降で確定するため)
 *  4. frontmatter必須項目(title, order, minutes)— lib/content.tsのロード時に検証
 *
 * 全項目を1回の実行で収集し(最初のエラーで打ち切らない)、file:reason形式で報告する。
 */

export interface ValidationIssue {
  filePath: string;
  message: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  manifest: SlugManifest | null;
}

const LOCALES: readonly Locale[] = ["ja", "en"];

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** 演習testsのロジック部分(nameを除く)のハッシュ。.claude/rules/i18n.md「testsはロジック共有」対応 */
function hashExerciseTests(exercise: ExerciseEntry): string {
  const strippedTests = exercise.definition.tests.map((testCase) => {
    const clone: Record<string, unknown> = { ...testCase };
    delete clone.name;
    return clone;
  });
  return createHash("sha256").update(stableStringify(strippedTests)).digest("hex");
}

const INTERNAL_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
const EXTERNAL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** content/配下の相対リンク切れを検査する。外部URL/アンカー/絶対パスは対象外 */
function checkLinks(lesson: LessonEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lessonDir = path.dirname(lesson.filePath);
  for (const match of lesson.body.matchAll(INTERNAL_LINK_RE)) {
    const target = match[1]?.trim();
    if (!target) continue;
    if (target.startsWith("#") || target.startsWith("/")) continue;
    if (EXTERNAL_SCHEME_RE.test(target)) continue;
    const [targetPath] = target.split("#");
    const resolved = path.resolve(lessonDir, targetPath);
    const candidates = [resolved, `${resolved}.mdx`];
    const exists = candidates.some((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!exists) {
      issues.push({
        filePath: lesson.filePath,
        message: `リンク切れ: "${target}" の参照先が見つかりません`,
      });
    }
  }
  return issues;
}

function safeLoadAllModules(
  root: string,
  locale: Locale,
  issues: ValidationIssue[],
): Map<string, ModuleContent> {
  const result = new Map<string, ModuleContent>();
  for (const slug of listModuleSlugs(root, locale)) {
    try {
      result.set(slug, loadModule(root, locale, slug));
    } catch (err) {
      if (err instanceof ContentValidationError) {
        issues.push({ filePath: err.filePath, message: err.message.replace(`${err.filePath}: `, "") });
      } else {
        throw err;
      }
    }
  }
  return result;
}

export function validateContent(root: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  const byLocale = new Map<Locale, Map<string, ModuleContent>>(
    LOCALES.map((locale) => [locale, safeLoadAllModules(root, locale, issues)]),
  );
  const ja = byLocale.get("ja")!;
  const en = byLocale.get("en")!;

  const jaModuleSlugs = new Set(ja.keys());
  const enModuleSlugs = new Set(en.keys());

  for (const slug of jaModuleSlugs) {
    if (!enModuleSlugs.has(slug)) {
      issues.push({
        filePath: path.join(root, "en", slug),
        message: `モジュールslugが欠落しています(jaに存在): ${slug}`,
      });
    }
  }
  for (const slug of enModuleSlugs) {
    if (!jaModuleSlugs.has(slug)) {
      issues.push({
        filePath: path.join(root, "ja", slug),
        message: `モジュールslugが欠落しています(enに存在): ${slug}`,
      });
    }
  }

  const commonModuleSlugs = [...jaModuleSlugs].filter((slug) => enModuleSlugs.has(slug)).sort();

  for (const moduleSlug of commonModuleSlugs) {
    const jaModule = ja.get(moduleSlug)!;
    const enModule = en.get(moduleSlug)!;

    const jaLessons = new Map(jaModule.lessons.map((l) => [path.basename(l.filePath), l]));
    const enLessons = new Map(enModule.lessons.map((l) => [path.basename(l.filePath), l]));
    for (const fileName of jaLessons.keys()) {
      if (!enLessons.has(fileName)) {
        issues.push({
          filePath: path.join(root, "en", moduleSlug, fileName),
          message: `レッスンslugが欠落しています(jaに存在): ${moduleSlug}/${fileName}`,
        });
      }
    }
    for (const fileName of enLessons.keys()) {
      if (!jaLessons.has(fileName)) {
        issues.push({
          filePath: path.join(root, "ja", moduleSlug, fileName),
          message: `レッスンslugが欠落しています(enに存在): ${moduleSlug}/${fileName}`,
        });
      }
    }

    if (!!jaModule.quizFilePath !== !!enModule.quizFilePath) {
      const missingLocale: Locale = jaModule.quizFilePath ? "en" : "ja";
      const presentLocale: Locale = missingLocale === "en" ? "ja" : "en";
      issues.push({
        filePath: path.join(root, missingLocale, moduleSlug, "quiz.yaml"),
        message: `quiz.yamlが欠落しています(${presentLocale}に存在)`,
      });
    }

    const jaExercises = new Map(jaModule.exercises.map((e) => [path.basename(e.filePath), e]));
    const enExercises = new Map(enModule.exercises.map((e) => [path.basename(e.filePath), e]));
    for (const [fileName, jaEx] of jaExercises) {
      const enEx = enExercises.get(fileName);
      if (!enEx) {
        issues.push({
          filePath: path.join(root, "en", moduleSlug, "labs", fileName),
          message: `演習YAMLが欠落しています(jaに存在): ${moduleSlug}/labs/${fileName}`,
        });
        continue;
      }
      if (hashExerciseTests(jaEx) !== hashExerciseTests(enEx)) {
        issues.push({
          filePath: enEx.filePath,
          message: `演習testsのハッシュが一致しません(${jaEx.filePath} と不一致)`,
        });
      }
    }
    for (const fileName of enExercises.keys()) {
      if (!jaExercises.has(fileName)) {
        issues.push({
          filePath: path.join(root, "ja", moduleSlug, "labs", fileName),
          message: `演習YAMLが欠落しています(enに存在): ${moduleSlug}/labs/${fileName}`,
        });
      }
    }

    for (const lesson of [...jaModule.lessons, ...enModule.lessons]) {
      issues.push(...checkLinks(lesson));
    }
  }

  if (issues.length > 0) {
    return { issues, manifest: null };
  }

  const entries: SlugManifestEntry[] = [];
  for (const moduleSlug of commonModuleSlugs) {
    const jaModule = ja.get(moduleSlug)!;
    for (const lesson of jaModule.lessons) {
      entries.push({ itemType: "lesson", slug: lesson.slug, module: moduleSlug });
    }
    if (jaModule.quizFilePath) {
      entries.push({ itemType: "quiz", slug: `${moduleSlug}/quiz`, module: moduleSlug });
    }
    for (const exercise of jaModule.exercises) {
      entries.push({ itemType: "exercise", slug: exercise.slug, module: moduleSlug });
    }
  }

  const manifest: SlugManifest = {
    generatedAt: new Date().toISOString(),
    entries,
  };
  SlugManifestSchema.parse(manifest);

  return { issues: [], manifest };
}

function printIssues(issues: ValidationIssue[]): void {
  for (const issue of issues) {
    console.error(`✗ ${issue.filePath}: ${issue.message}`);
  }
}

function resolveArg(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  const value = index !== -1 ? process.argv[index + 1] : undefined;
  return value ? path.resolve(value) : fallback;
}

async function main(): Promise<number> {
  const root = resolveArg("--root", path.join(process.cwd(), "content"));
  const outPath = resolveArg(
    "--out",
    path.join(process.cwd(), "content", "generated", "slug-manifest.json"),
  );

  const result = validateContent(root);

  if (result.issues.length > 0) {
    console.error(`content検証: ${result.issues.length}件のエラー`);
    printIssues(result.issues);
    return 1;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(result.manifest, null, 2)}\n`, "utf-8");
  console.log(`content検証: 成功(${result.manifest?.entries.length ?? 0}件のslug)`);
  console.log(`slugマニフェストを書き出しました: ${outPath}`);
  return 0;
}

const isMain = process.argv[1] ? import.meta.url === `file://${process.argv[1]}` : false;
if (isMain) {
  main().then((code) => {
    process.exitCode = code;
  });
}
