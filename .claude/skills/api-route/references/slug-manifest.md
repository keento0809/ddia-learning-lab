# ビルド時slugマニフェストとの照合

正: `docs/design/02_詳細設計書.md §9`(コンテンツビルドパイプライン生成物)、
`§3.1`(「itemSlugはビルド時に生成したslugマニフェストに対して照合し、
未知slugは409(slug_unknown)」)。

## 何のためにあるか

`lesson`/`quiz`/`exercise`のslugはコンテンツ(`content/{ja,en}/**`)から
ビルド時に導出される。APIが受け取った`itemSlug`が実在するコンテンツを
指しているかは、DBスキーマだけでは保証できないため、ビルド時に生成した
`content/generated/slug-manifest.json`(`.gitignore`対象、
`npm run validate:content`が生成)に対してサーバ側で照合する。

## 契約(変更禁止)

`lib/contracts/manifest.ts` に定義済み:

```ts
export const SlugManifestEntrySchema = z.object({
  itemType: ProgressItemTypeSchema, // "lesson" | "quiz" | "exercise"
  slug: z.string().min(1),
  module: z.string().min(1),
});
export const SlugManifestSchema = z.object({
  generatedAt: z.string(),
  entries: z.array(SlugManifestEntrySchema),
});
```

## 使い方

`lib/progress/slugManifest.ts` が既に照合用のヘルパーを提供している。
**新しいマニフェストパーサや静的importを自作しない**。既存のものを再利用する:

```ts
import { isKnownSlug, slugsForModule, countSlugsByType } from "@/lib/progress/slugManifest";

if (!isKnownSlug(itemType, itemSlug)) {
  return problemResponse(c, 409, "about:blank#slug-unknown", "slug_unknown");
}
```

- `isKnownSlug(itemType, slug)`: そのslugが有効か。状態変更系(PUT等)の
  入り口で必ず呼ぶ。
- `slugsForModule(moduleSlug)`: モジュール配下の全slug。集計系
  (ダッシュボードなど)で使う。
- `countSlugsByType(itemType)`: itemType別の全件数。分母が必要な集計で使う。

worker-api(workerdランタイム)は`node:fs`が使えないため、マニフェストは
ビルド時生成JSONの静的importで読む設計になっている。ランタイムで
`content/**`を直接読みに行く実装を新設しない(T-000の制約、
`docs/skeleton-notes.md`)。

## テストで使うslug

統合テストでは実在するslugを使う必要がある。既存テストで使われている
既知slugの例(`tests/fixtures/content/valid`または通常ビルドの結果):

```ts
const KNOWN_LESSON = { itemType: "lesson", itemSlug: "01-reliability/01-load-and-performance" };
const KNOWN_QUIZ = { itemType: "quiz", itemSlug: "01-reliability/quiz" };
```

存在しないslug(例: `"nonexistent-module/nope"`)を使えば409系のテストケースを
作れる。
