import { z } from "zod";

/**
 * module.yaml(content/{ja,en}/**\/module.yaml)のコントラクト。
 * 参照設計: docs/design/02_詳細設計書.md §1(ディレクトリ構成、「モジュールメタ (順序, 所要時間)」)、
 * §9(frontmatter必須項目 title/order/minutes)。
 *
 * T-006実施時点では03文書T-101行が前提とする「module.yamlスキーマ(T-010の型)」が
 * lib/contracts/に未定義だったため、T-006検証専用のローカルスキーマ(lib/content.ts)
 * として暫定実装していた(STATUS.md 2026-07-18決定事項ログ、T-010参照)。
 * T-101着手にあたり本ファイルへ正式に昇格し、lib/content.tsはこの契約を再利用する
 * (フィールドはT-006時点から変更なし)。
 *
 * 3部(Part I〜III)のセクション分割はorderの範囲(design上の固定カリキュラム構成:
 * モジュール1-4=Part I, 5-9=Part II, 10-12=Part III)で導出する設計判断とし、
 * module.yaml自体には`part`フィールドを追加しない(02文書がpartフィールドを
 * 定義しておらず、frontmatter必須項目もtitle/order/minutesのみのため)。
 */
export const ModuleMetaSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().positive(),
  minutes: z.number().positive(),
});
export type ModuleMeta = z.infer<typeof ModuleMetaSchema>;
