import type { ComponentType } from "react";
import { notFound } from "next/navigation";

/**
 * 失敗→恒久対策: 当初この関数はpage.tsx内のローカル関数だったが、T-602の
 * アクセスガード統合テスト(tests/unit/lesson/accessGate.test.ts)で
 * 「認証済み/Free Tierでは本文コンポーネントがツリーに含まれる」ことを検証する際、
 * `.mdx`の動的import(`@next/mdx`のwebpackコンテキストモジュール解決)がVitest
 * (Vite)環境では解決できず(MDX用loaderが登録されていないため)、ローカル関数のままでは
 * モック不能で検証経路が失敗していた。I/O境界(fs/webpack依存のMDX解決)を専用モジュールに
 * 切り出し、`vi.mock("@/lib/lessonContentLoader")`で差し替え可能にした
 * (lib/moduleDetail.ts・lib/lessonPage.tsと同じ「page.tsxはlib/*.tsへ委譲する」層構造)。
 *
 * content/{locale}/{module}/{lesson}.mdxをビルド時に解決する(@next/mdxの
 * webpackローダによるcontext module化。lib/content.tsの`node:fs`直接importを
 * 避ける既存パターン(T-101/T-102決定事項ログ)と同じ理由: Cloudflare Workers
 * のリクエスト処理経路にfs読み込みを持ち込まないため)。該当ファイルが存在しない
 * 場合はnotFound()。
 */
export async function loadLessonContent(
  locale: string,
  moduleSlug: string,
  lessonId: string,
): Promise<ComponentType> {
  try {
    const mod: { default: ComponentType } = await import(
      `@/content/${locale}/${moduleSlug}/${lessonId}.mdx`
    );
    return mod.default;
  } catch {
    notFound();
  }
}
