import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { loadAllModules } from "../lib/content";
import { loadGlossary, type GlossaryEntry } from "../lib/glossaryContent";
import { loadQuiz } from "../lib/quiz/content";
import type { Quiz } from "../lib/contracts/quiz";
import type { ExerciseDefinition } from "../lib/contracts/exercise";
import type { Locale } from "../lib/contracts/common";
import type { CurriculumModuleSummary } from "../lib/curriculum";
import type { ModuleDetailSummary } from "../lib/moduleDetail";
import { loadScenario } from "../lib/scenario/content";
import type { ScenarioDefinition } from "../lib/scenario/schema";
import { buildLessonPreviewMarkdown } from "../lib/lessonPreview";

/**
 * S-02 カリキュラム一覧(T-101)/ S-03 モジュール詳細(T-102)向けの
 * 静的データ生成(Node CLIスクリプト)。
 * 参照設計: docs/skeleton-notes.md「設計への示唆」、STATUS.md 2026-07-18決定事項ログ。
 *
 * `lib/content.ts`(node:fs依存)は、next buildの静的生成文脈またはNode CLIから
 * のみ使用できる(Cloudflare Workersのリクエスト処理経路では`node:fs`が実装されて
 * いないため)。`app/[locale]/learn/page.tsx`がServer Componentとしてバンドルされる
 * とfs呼び出しがバンドルに含まれてしまいT-000で確認済みの障害を再現するため、
 * ここでビルド時にJSON化し、ページ側は`lib/curriculum.ts` / `lib/moduleDetail.ts`
 * 経由で通常のESM importとして取り込む(`@next/mdx`がMDXに対して行っているのと
 * 同じ「ビルド時解決」)。
 *
 * `npm run build` / `npm run typecheck` / `npm run test` / `npm run dev` の
 * pre-hook(package.json)から実行される。
 *
 * `ModuleDetailSummary`はtypeのみのimportのため(`import type`はesbuild/tsxの
 * トランスパイル時に完全に除去される)、`lib/moduleDetail.ts`が読み込む
 * `lib/generated/module-detail.*.json`(このスクリプトの生成物)が未生成の
 * 初回実行時でも本スクリプト自体の実行は妨げられない。
 */

const LOCALES: readonly Locale[] = ["ja", "en"];

export function generateCurriculum(root: string): Record<Locale, CurriculumModuleSummary[]> {
  const result = {} as Record<Locale, CurriculumModuleSummary[]>;
  for (const locale of LOCALES) {
    result[locale] = loadAllModules(root, locale)
      .map((mod) => ({ meta: mod.meta, lessonCount: mod.lessons.length }))
      .sort((a, b) => a.meta.order - b.meta.order);
  }
  return result;
}

/**
 * S-03「レッスン/クイズ/演習の目次」向けのモジュール別詳細データ。
 * レッスンはfrontmatterのorder昇順、演習はファイル名昇順(loadAllModules側で
 * 整列済み)のまま保持する。
 */
export function generateModuleDetail(root: string): Record<Locale, ModuleDetailSummary[]> {
  const result = {} as Record<Locale, ModuleDetailSummary[]>;
  for (const locale of LOCALES) {
    result[locale] = loadAllModules(root, locale)
      .map((mod) => ({
        meta: mod.meta,
        lessons: [...mod.lessons]
          .sort((a, b) => a.frontmatter.order - b.frontmatter.order)
          .map((lesson) => ({
            id: path.basename(lesson.filePath).replace(/\.mdx$/, ""),
            title: lesson.frontmatter.title,
            order: lesson.frontmatter.order,
            minutes: lesson.frontmatter.minutes,
          })),
        hasQuiz: mod.quizFilePath !== null,
        exercises: mod.exercises.map((exercise) => ({ slug: exercise.slug })),
      }))
      .sort((a, b) => a.meta.order - b.meta.order);
  }
  return result;
}

/**
 * S-05 クイズ(T-106)向けのモジュール別quiz.yamlデータ。キーはモジュールslug。
 * quiz.yamlを持たないモジュールはキー自体を含めない(呼び出し側は`hasQuiz`
 * <lib/moduleDetail.ts>で存在有無を判定済みのため、undefinedは「未生成」ではなく
 * 「quiz.yamlなし」を意味する)。
 */
export function generateQuiz(root: string): Record<Locale, Record<string, Quiz>> {
  const result = {} as Record<Locale, Record<string, Quiz>>;
  for (const locale of LOCALES) {
    const byModule: Record<string, Quiz> = {};
    for (const mod of loadAllModules(root, locale)) {
      if (mod.quizFilePath) {
        byModule[mod.slug] = loadQuiz(mod.quizFilePath);
      }
    }
    result[locale] = byModule;
  }
  return result;
}

/**
 * S-06 演習ページ(T-108r, 02§4.2)向けの演習YAMLデータ。キーは演習YAMLの
 * `slug`フィールドそのもの(content/{locale}配下で一意、.claude/rules/i18n.md)。
 * `lib/moduleDetail.ts`のexercises(slugのみ)とは異なり、ExerciseDefinition
 * 全体(template/tests/hints等)を保持する。
 */
export function generateExercises(root: string): Record<Locale, Record<string, ExerciseDefinition>> {
  const result = {} as Record<Locale, Record<string, ExerciseDefinition>>;
  for (const locale of LOCALES) {
    const bySlug: Record<string, ExerciseDefinition> = {};
    for (const mod of loadAllModules(root, locale)) {
      for (const exercise of mod.exercises) {
        bySlug[exercise.slug] = exercise.definition;
      }
    }
    result[locale] = bySlug;
  }
  return result;
}

/**
 * <Term>(T-103, 02§4.1)向けのcontent/glossary.yaml静的データ生成。
 * .claude/rules/i18n.md「用語はcontent/glossary.yamlを正とする」に対応するファイルは
 * ロケール別ではなく単一(entryごとにja/enを併記)のため、curriculum/module-detailとは
 * 異なりロケール分岐しない。
 */
export function generateGlossary(root: string): GlossaryEntry[] {
  return loadGlossary(root);
}

/**
 * S-06相当のキャップストーン画面(T-302)向けのcontent/scenario-capstone.yaml静的データ生成。
 * glossary.yamlと同じ理由(単一ファイル・ロケール分岐なし、文言はLocalizedTextで併記)で
 * ロケール別に分岐しない。
 */
export function generateScenario(root: string): ScenarioDefinition {
  return loadScenario(root);
}

/** module.yamlのorder(ADR-009 §3.1: Free Tier境界。lib/contracts/access.tsと同じ定数値) */
const FREE_TIER_MODULE_ORDER = 1;
/** モジュール内でPreview対象になるレッスンのorder(各モジュール第1レッスンのみ) */
const PREVIEW_LESSON_ORDER = 1;

/**
 * T-602(ADR-009 §3.1 Preview階層): モジュール2〜12の第1レッスンの冒頭
 * (lib/lessonPreview.ts、見出し2つ分または約30%)をビルド時にHTML化する。
 * キーは`{moduleSlug}/{lessonId}`(lib/moduleDetail.tsのtocItemSlugと同形式)。
 * Free Tier(モジュール1)は対象外(常に全文が未認証でも見えるためプレビュー不要)。
 */
export function generateLessonPreview(root: string): Record<Locale, Record<string, string>> {
  const result = {} as Record<Locale, Record<string, string>>;
  for (const locale of LOCALES) {
    const byLessonSlug: Record<string, string> = {};
    for (const mod of loadAllModules(root, locale)) {
      if (mod.meta.order === FREE_TIER_MODULE_ORDER) continue;
      const firstLesson = mod.lessons.find(
        (lesson) => lesson.frontmatter.order === PREVIEW_LESSON_ORDER,
      );
      if (!firstLesson) continue;
      const previewMarkdown = buildLessonPreviewMarkdown(firstLesson.body);
      const previewHtml = marked.parse(previewMarkdown, { async: false });
      const lessonId = path.basename(firstLesson.filePath).replace(/\.mdx$/, "");
      byLessonSlug[`${mod.slug}/${lessonId}`] = previewHtml;
    }
    result[locale] = byLessonSlug;
  }
  return result;
}

function resolveArg(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  const value = index !== -1 ? process.argv[index + 1] : undefined;
  return value ? path.resolve(value) : fallback;
}

function main(): void {
  const root = resolveArg("--root", path.join(process.cwd(), "content"));
  const outDir = resolveArg("--out", path.join(process.cwd(), "lib", "generated"));

  const curriculum = generateCurriculum(root);
  const moduleDetail = generateModuleDetail(root);
  const quiz = generateQuiz(root);
  const exercises = generateExercises(root);
  const glossary = generateGlossary(root);
  const scenario = generateScenario(root);
  const lessonPreview = generateLessonPreview(root);

  fs.mkdirSync(outDir, { recursive: true });

  const glossaryOutPath = path.join(outDir, "glossary.json");
  fs.writeFileSync(glossaryOutPath, `${JSON.stringify(glossary, null, 2)}\n`, "utf-8");
  console.log(`用語集データを書き出しました: ${glossaryOutPath}(${glossary.length}件)`);

  const scenarioOutPath = path.join(outDir, "scenario-capstone.json");
  fs.writeFileSync(scenarioOutPath, `${JSON.stringify(scenario, null, 2)}\n`, "utf-8");
  console.log(`キャップストーンシナリオデータを書き出しました: ${scenarioOutPath}`);

  for (const locale of LOCALES) {
    const outPath = path.join(outDir, `curriculum.${locale}.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(curriculum[locale], null, 2)}\n`, "utf-8");
    console.log(`カリキュラムデータを書き出しました: ${outPath}(${curriculum[locale].length}件)`);

    const detailOutPath = path.join(outDir, `module-detail.${locale}.json`);
    fs.writeFileSync(
      detailOutPath,
      `${JSON.stringify(moduleDetail[locale], null, 2)}\n`,
      "utf-8",
    );
    console.log(
      `モジュール詳細データを書き出しました: ${detailOutPath}(${moduleDetail[locale].length}件)`,
    );

    const quizOutPath = path.join(outDir, `quiz.${locale}.json`);
    fs.writeFileSync(quizOutPath, `${JSON.stringify(quiz[locale], null, 2)}\n`, "utf-8");
    console.log(
      `クイズデータを書き出しました: ${quizOutPath}(${Object.keys(quiz[locale]).length}件)`,
    );

    const exercisesOutPath = path.join(outDir, `exercise.${locale}.json`);
    fs.writeFileSync(exercisesOutPath, `${JSON.stringify(exercises[locale], null, 2)}\n`, "utf-8");
    console.log(
      `演習データを書き出しました: ${exercisesOutPath}(${Object.keys(exercises[locale]).length}件)`,
    );

    const lessonPreviewOutPath = path.join(outDir, `lesson-preview.${locale}.json`);
    fs.writeFileSync(
      lessonPreviewOutPath,
      `${JSON.stringify(lessonPreview[locale], null, 2)}\n`,
      "utf-8",
    );
    console.log(
      `レッスンプレビューデータを書き出しました: ${lessonPreviewOutPath}(${Object.keys(lessonPreview[locale]).length}件)`,
    );
  }
}

const isMain = process.argv[1] ? import.meta.url === `file://${process.argv[1]}` : false;
if (isMain) {
  main();
}
