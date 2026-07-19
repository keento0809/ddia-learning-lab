import type { GlossaryEntry } from "./glossaryContent";
import glossaryData from "./generated/glossary.json";

/**
 * <Term>(T-103, 02§4.1「用語集ポップオーバー(対訳表示)」)向けの実行時ルックアップ。
 * lib/curriculum.ts/lib/moduleDetail.tsと同じ理由(node:fs非依存を保つ)で、
 * ビルド時生成済みJSON(scripts/generate-curriculum.tsのgenerateGlossary)を
 * 通常のESM importとして取り込む。
 *
 * content/glossary.yamlが未作成(用語集コンテンツ自体が未着手)の間は空配列が
 * importされ、getGlossaryEntryは常にundefinedを返す。呼び出し側(Term)は
 * この状態を「用語集リンクなしでchildrenのみ描画」という正当な状態として扱う。
 */
const GLOSSARY = glossaryData as GlossaryEntry[];

export function getGlossaryEntry(slug: string): GlossaryEntry | undefined {
  return GLOSSARY.find((entry) => entry.slug === slug);
}
