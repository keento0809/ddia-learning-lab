/**
 * T-306 検索(S-09)向けの検索ドキュメント型。
 * 参照設計: docs/design/01_基本設計書.md 画面一覧(S-09「コンテンツ横断検索」)。
 * lib/contracts/配下は変更禁止(CLAUDE.md規則2)のため、検索専用の型はここに置く。
 * flexsearchのDocument<D>はD extends {[key: string]: DocumentValue}を要求するため、
 * 文字列インデックスシグネチャを持たせる。
 */

export type SearchDocumentKind = "module" | "lesson" | "glossary";

export interface SearchDocument {
  [key: string]: string;
  /** ロケール内で一意。"{kind}:{slug}"形式 */
  id: string;
  kind: SearchDocumentKind;
  title: string;
  /** 索引対象の全文プレーンテキスト(検索結果には表示しない) */
  body: string;
  /** 検索結果一覧に表示する抜粋 */
  excerpt: string;
  /** ロケールプレフィックスなしのルート内相対パス */
  href: string;
}
