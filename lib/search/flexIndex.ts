import { Document } from "flexsearch";
import type { MergedDocumentSearchResults } from "flexsearch";
import type { Locale } from "../contracts/common";
import type { SearchDocument } from "./types";

/**
 * T-306 検索(S-09)向けのFlexSearchインデックス共通スキーマ。
 * 参照設計: docs/design/02_詳細設計書.md §9(検索インデックス), §12-4
 * (「検索のホスティング: 静的FlexSearchで開始し、コンテンツ増加時にサーバ検索へ
 * 移行する閾値(インデックス>5MB)を目安とする」)。
 *
 * ビルド時生成(scripts/generate-curriculum.ts、Node)とブラウザ側の復元
 * (components/search/SearchPage.tsx)の両方から、全く同じオプションで
 * `createSearchIndex`をインスタンス化し、ドキュメント追加は必ず`addSearchDocument`、
 * 検索は必ず`searchDocuments`を経由する必要がある(日本語はどちらもバイグラム変換を
 * 要求するため、生の`index.add`/`index.search`を直接呼ぶと索引時・検索時で
 * トークン化が食い違う)。
 *
 * 日本語(ja)は最初、FlexSearch組み込みのCJKチャーセット(1文字単位分割+
 * tokenize:"forward"の前方一致展開)を採用したが、qa-evaluator実機検証で
 * 「分断」のような一般的な単漢字を含む複合語クエリが「分」と「断」がドキュメント中の
 * どこかに(隣接している必要すらなく)存在すればヒットするAND検索に還元されてしまい、
 * 実測で上位20件中65%が無関係な文書という重大な適合率崩壊が判明した。
 * 次に、FlexSearchの`encoder.finalize`拡張点で2文字バイグラムに変換する案を試したが、
 * 実機検証で「finalizeが句読点/文字種の境界とみられる箇所で入力を複数セグメントに
 * 分割して呼び出され、長文(100文字程度)ではセグメント境界をまたぐ内容が索引から
 * 丸ごと欠落する」という未文書化の挙動を発見し、この経路も採用しなかった。
 *
 * 最終的に、バイグラム化をFlexSearchの内部パイプラインの外(プレーンなJS関数
 * `toBigramTokens`)で行い、変換結果を空白区切りで結合した文字列を既定の
 * (空白分割)エンコーダで索引化する方式にした。索引用の値は表示用の
 * title/excerptとは別フィールド(titleIndex/bodyIndex、store対象外)に格納し、
 * 検索結果の表示文言が壊れないようにする。クエリ文字列も同じ`toBigramTokens`を
 * 通してから検索する。
 * 1文字クエリ(バイグラムを作れない)は、索引に存在する2文字トークンとは
 * 厳密一致しないはずだが、実データ(content/、164ドキュメント)での実機検証では
 * FlexSearch側の挙動により空にはならず、その文字を実際に含む文書がヒットする
 * (qa-evaluator実機検証で発覚: 小規模フィクスチャでは空になるが、本番相当の
 * データ量では非空になるという、コーパス規模に依存した未解明のFlexSearch内部挙動)。
 * 複数の1文字クエリで機械的に偽陽性ゼロ(実際にその文字を含む文書のみヒット)を
 * 確認済みのため、実害はない(むしろ短いクエリでも結果が得られる方が実用上好ましい)。
 * 「1文字クエリは常に空になる」という保証はコード上もテスト上も主張しない。
 *
 * 英語(en)は空白区切りの単語をそのまま前方一致展開できるため、既定のエンコーダ+
 * tokenize:"forward"のまま(バイグラム変換なし)でよい。
 */
export type SearchIndex = Document<SearchDocument>;

const STORE_FIELDS = ["title", "excerpt", "href", "kind"] as const;

/**
 * 空白を除去してからバイグラム化する。空白を含んだまま2文字ペアを作ると
 * (例:「入門 分散」の「門」+空白)、結合後の文字列を既定の(空白区切り)
 * エンコーダで再度トークン化する際にペア内の空白で分割されてしまい、
 * 「門」のような1文字トークンが紛れ込む(実機検証で発見: 1文字クエリが
 * ヒットしないはずが、空白由来の1文字トークンにヒットしていた)。
 */
function toBigramTokens(text: string): string {
  const chars = Array.from(text.trim().replace(/\s+/g, ""));
  if (chars.length <= 1) return chars.join(" ");
  const grams: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    grams.push(chars[i] + chars[i + 1]);
  }
  return grams.join(" ");
}

export function createSearchIndex(locale: Locale): SearchIndex {
  return new Document<SearchDocument>({
    document: {
      id: "id",
      index: locale === "ja" ? ["titleIndex", "bodyIndex"] : ["title", "body"],
      store: [...STORE_FIELDS],
    },
    tokenize: locale === "ja" ? "strict" : "forward",
    encoder: "Default",
  });
}

/** ドキュメントをインデックスへ追加する。日本語は索引用フィールドをバイグラム化してから追加する。 */
export function addSearchDocument(index: SearchIndex, locale: Locale, doc: SearchDocument): void {
  if (locale === "ja") {
    index.add({
      ...doc,
      titleIndex: toBigramTokens(doc.title),
      bodyIndex: toBigramTokens(doc.body),
    });
  } else {
    index.add(doc);
  }
}

/** ビルド時生成物(lib/generated/search-index.{locale}.json)のシリアライズ形式。キーはFlexSearch内部パーツ名。 */
export type SearchIndexExport = Record<string, string>;

/** インデックスを`export`し、静的JSONとして書き出せる形にまとめる(scripts/generate-curriculum.ts専用)。 */
export function exportSearchIndex(index: SearchIndex): SearchIndexExport {
  const chunks: SearchIndexExport = {};
  index.export((key, data) => {
    chunks[key] = data;
  });
  return chunks;
}

/** ビルド時生成済みJSONから、ブラウザ側でインデックスを復元する(components/search/SearchPage.tsx専用)。 */
export function loadSearchIndex(locale: Locale, exported: SearchIndexExport): SearchIndex {
  const index = createSearchIndex(locale);
  for (const [key, data] of Object.entries(exported)) {
    index.import(key, data);
  }
  return index;
}

export type SearchHit = { id: string; doc: SearchDocument | null };

/** title/body横断でのドキュメント検索(フィールドをまたいだ結果を1本のリストにマージ)。 */
export function searchDocuments(
  index: SearchIndex,
  locale: Locale,
  query: string,
  limit = 20,
): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  const encodedQuery = locale === "ja" ? toBigramTokens(trimmed) : trimmed;
  const results = index.search(encodedQuery, {
    limit,
    enrich: true,
    merge: true,
  }) as MergedDocumentSearchResults<SearchDocument>;
  return results.map((hit) => ({ id: String(hit.id), doc: hit.doc ?? null }));
}
