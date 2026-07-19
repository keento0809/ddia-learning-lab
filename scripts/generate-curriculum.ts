import fs from "node:fs";
import path from "node:path";
import { loadAllModules } from "../lib/content";
import type { Locale } from "../lib/contracts/common";
import type { CurriculumModuleSummary } from "../lib/curriculum";
import type { ModuleDetailSummary } from "../lib/moduleDetail";

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

  fs.mkdirSync(outDir, { recursive: true });
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
  }
}

const isMain = process.argv[1] ? import.meta.url === `file://${process.argv[1]}` : false;
if (isMain) {
  main();
}
