# RFC 9457 Problem Details でのエラー返却

正: `docs/design/02_詳細設計書.md §3`(共通仕様「エラーは RFC 9457 Problem
Details形式」)。実装は2箇所にヘルパーがあり、シグネチャが違う点に注意する。

## worker-api(Hono)側: `workers/api/src/problem.ts`

```ts
export function problemResponse(
  c: Context,
  status: ContentfulStatusCode,
  type: string,
  title: string,
  detail?: string,
);
```

呼び出し例(`workers/api/src/routes/progress.ts`から):

```ts
return problemResponse(
  c,
  409,
  "about:blank#slug-unknown",
  "slug_unknown",
);

return problemResponse(
  c,
  400,
  "about:blank#validation-error",
  "validation_error",
  parsed.error.issues.map((issue) => issue.message).join("; "),
);
```

## worker-app(Next.js Route Handler)側: `lib/auth/http.ts`

```ts
export function problemResponse(
  status: number,
  type: string,
  title: string,
  detail?: string,
): NextResponse<ProblemDetails>;
```

引数の並びが `(c, status, ...)` ではなく `(status, ...)` から始まる点が
Hono版と異なる。worker-app側(`app/api/auth/**`)で使う場合はこちら。

## 命名規約

- `type`: `about:blank#<kebab-case>` 形式(専用URIを持たないため
  `about:blank`ベースにフラグメントで種別を付ける、既存実装の踏襲)。
- `title`: `snake_case` の短い識別子(例: `unauthorized`, `validation_error`,
  `slug_unknown`, `csrf_token_invalid`, `not_found`, `internal_error`)。
  クライアント側はこの`title`で分岐することがあるため、既存の命名と
  衝突・重複しないか(あるいは既存のものを再利用できないか)を確認する。
- `detail`: 人間可読の追加説明。zodのバリデーションエラーなら
  `issues.map((issue) => issue.message).join("; ")` の形で連結する
  (既存実装と揃える)。

## 代表的なステータスコードの使い分け(既存実装から)

| status | 用途 |
|---|---|
| 400 | リクエストボディ/クエリのバリデーション失敗、不正なJSON |
| 401 | 未認証(セッション/JWT検証失敗) |
| 403 | CSRFトークン不一致 |
| 404 | 存在しないルート(Honoの`app.notFound`で一括処理) |
| 409 | slugマニフェストに存在しない`itemSlug`など、状態競合 |
| 413 | リクエストボディが上限を超過(例: submissionsの`code`が64KB超) |
| 500 | 未捕捉例外(Honoの`app.onError`で一括処理、Sentryへも送信) |

新しいエラー種別を追加する前に、既存の`title`一覧(上表・
`workers/api/src/routes/*.ts`、`app/api/**/route.ts`)を検索し、
同じ意味のエラーが既にあれば再利用する。
