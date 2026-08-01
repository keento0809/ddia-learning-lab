/**
 * T-601(アクセス制御方式選定スパイク、ADR-009 §4)専用の最小コンテンツ定数。
 * 対象はモジュール2第1レッスン(02-data-models/01-relational-vs-document)の
 * 1本のみ。方式Bのworker-api側は`node:fs`を使えない(workerdランタイム制約、
 * lib/content.tsのコメント参照)ため、本文をビルド成果物ではなくソースの
 * 定数として直接埋め込む(T-602で本実装する際はビルド時生成に置き換える前提の
 * 使い捨てプロトタイプ、PR本文に明記)。
 *
 * プレビュー範囲はADR-009 §3.1「見出し2つ分 or 約30%」に合わせ、最初の2つの
 * H2セクション(「リレーショナルモデルの考え方」/「ドキュメントモデルの考え方」)
 * までとする。
 */

export const SPIKE_LESSON_MODULE_SLUG = "02-data-models";
export const SPIKE_LESSON_ID = "01-relational-vs-document";

export const spikeLessonPreview: Record<"ja" | "en", string> = {
  ja: `# リレーショナルモデルとドキュメントモデルの選択

アプリケーションを作るとき、最初に決めなければならない設計判断の1つが「データをどんな形で
表現するか」である。この章では、実務で広く使われる2つの代表的なデータモデル——リレーショナル
モデルとドキュメントモデル——を比較し、それぞれがどんなデータ構造・アクセスパターンに向いて
いるかを見ていく。

## リレーショナルモデルの考え方

リレーショナルモデルでは、データを行(タプル)の集合であるテーブルとして表現する。あるテーブルの行が別のテーブルの
行を参照したいときは、外部キー(参照先の識別子を保持する列)を使う。テーブル同士は事前に
固定されたスキーマ(列名・型)を持ち、複数のテーブルにまたがるデータを1回のクエリで取得したい
場合は、SQLのJOINのように複数テーブルを結合して読み出す。

この設計の強みは、同じデータを複数箇所に重複して持たずに済む点と、テーブル間の関係を
後から柔軟に組み替えたクエリを書ける点にある。一方で、アプリケーションが扱いたい「ひとまとまり
のオブジェクト」が複数テーブルに分散していると、それを組み立てるための結合コストが発生する。

## ドキュメントモデルの考え方

ドキュメントモデルでは、関連するデータを1つの自己完結した構造化ドキュメント(JSONやそれに類する形式)にまとめて
格納する。ネストしたオブジェクトや配列をそのまま1件のレコードとして表現できるため、
「あるエンティティに関する情報一式」を1回の読み取りで取得しやすい。`,
  en: `# Choosing Between the Relational and Document Models

One of the first design decisions you have to make when building an application is
how to represent your data. This lesson compares two data models widely used in
practice — the relational model and the document model — and looks at what kinds of
data structures and access patterns each one suits.

## How the relational model thinks

The relational model represents data as tables, each a set of rows (tuples). When a row in one table needs
to reference a row in another table, it does so with a foreign key (a column holding
the referenced identifier). Tables have a fixed, predefined schema (column names and
types), and reading data that spans multiple tables in a single query means joining
those tables together, as with SQL's JOIN.

The strength of this design is that the same data doesn't need to be duplicated in
multiple places, and you can write queries that flexibly recombine relationships
between tables after the fact. The trade-off is that when the "single coherent
object" an application wants to work with is spread across multiple tables,
assembling it incurs the cost of a join.

## How the document model thinks

The document model stores related data together as a single, self-contained structured document (JSON
or a similar format). Because nested objects and arrays can be represented directly
as a single record, it's easy to fetch "everything related to one entity" in a
single read.`,
};

/**
 * 方式B(worker-api経由フェッチ)専用: プレーンテキスト化した全文(JSXタグを
 * 素朴に除去したもの)。方式Aは実際のコンパイル済みMDX(`content/{locale}/...`)を
 * そのまま使うため、この定数を使わない。
 */
export const spikeLessonFullPlainText: Record<"ja" | "en", string> = {
  ja: `${spikeLessonPreview.ja}

## インピーダンスミスマッチという問題

なぜドキュメントモデルが好まれる場面があるのか、その背景にある問題がインピーダンスミスマッチ
である。アプリケーションコードの中では、データはオブジェクトやネストした構造(木構造に近い形)
として扱われることが多い。ところがリレーショナルモデルの行はフラットな構造しか表現できないため、
アプリケーション側のオブジェクトを複数テーブルの行に分解して保存し、読み出すときにまた
組み立て直す変換作業(多くの場合ORMなどのマッピング層が担う)が必要になる。この「アプリ側の
表現」と「永続化層の表現」のズレと、それを埋めるための変換コストがインピーダンスミスマッチの
正体である。

ドキュメントモデルは、アプリケーション側の木構造に近い表現をほぼそのまま保存できるため、
この変換の手間が小さくなりやすい。

(情報) インピーダンスミスマッチが小さくなるのは、あくまで「アプリケーションが扱う単位」と
「ドキュメントの単位」が一致している場合に限られる。1つのドキュメントの中に、本来は
別々に更新・参照されるべきデータを詰め込みすぎると、かえって扱いにくくなることがある
(この点は次のレッスンで詳しく見る)。

## 1対多の関係はどちらが得意か

利用者と、その利用者が持つ複数の職歴のような「1対多」の関係は、両モデルとも表現できるが
アプローチが異なる。

- リレーショナルモデル: 利用者テーブルと職歴テーブルを分け、職歴テーブルに利用者IDの外部キーを
  持たせる。利用者と職歴をまとめて取得したい場合はJOINが必要になる。
- ドキュメントモデル: 利用者ドキュメントの中に職歴の配列を直接埋め込む。利用者と職歴は常に
  1回の読み取りでまとめて取得できる。

この「常にまとめて取得したい、かつ職歴側だけを他のエンティティから参照する必要がない」という
アクセスパターンでは、ドキュメントモデルの埋め込みが素直にはまる。逆に、職歴データを利用者とは
独立して検索・集計したい(例: 特定の役職の経験者を横断的に探す)場合は、埋め込みだと扱いにくく
なる。

(クイズは方式Bプロトタイプでは省略。実本文とほぼ同量のテキストを転送する目的のダミーではなく
実文をそのまま使用)`,
  en: `${spikeLessonPreview.en}

## The problem behind it: impedance mismatch

The reason the document model is preferred in some situations traces back to a
problem called impedance mismatch. Inside application code, data is often handled as objects or nested structures —
something close to a tree. But rows in the relational model can only represent flat
structures, so application-side objects have to be decomposed into rows across
multiple tables to be stored, then reassembled on read (a conversion often handled
by a mapping layer such as an ORM). This gap between "how the application represents
data" and "how the persistence layer represents data," and the conversion cost of
bridging it, is what impedance mismatch really refers to.

Because the document model can store something close to the application's
tree-shaped representation almost as-is, this conversion overhead tends to be
smaller.

(info) Impedance mismatch shrinks only when the "unit the application works with" and the
"unit of the document" actually line up. Cramming too much data that should really
be updated and read independently into a single document can end up making things
harder to work with (we'll look at this in more detail in the next lesson).

## Which model handles one-to-many better

A one-to-many relationship, like a user and the multiple work experiences that
belong to them, can be represented in either model, but the approaches differ.

- Relational model: split into a users table and a work-experience table, with the
  work-experience table holding a foreign key to the user's ID. Fetching a user
  together with their work history requires a JOIN.
- Document model: embed an array of work experiences directly inside the user
  document. The user and their work history can always be fetched together in a
  single read.

For this access pattern — "always want them together, and never need to look up work
experience independently of any other entity" — embedding in the document model is
a natural fit. Conversely, if you need to search or aggregate work-experience data
independently of the user (for example, finding everyone across all users who held a
particular job title), embedding becomes awkward.

(quiz omitted in the Method B prototype; the surrounding text is the real lesson
text, not filler, so the transferred byte count is representative)`,
};

export function isSpikeLocale(locale: string): locale is "ja" | "en" {
  return locale === "ja" || locale === "en";
}
