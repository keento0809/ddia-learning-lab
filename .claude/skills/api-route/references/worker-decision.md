# worker-app / worker-api どちらに実装するか(ADR-008)

正: `docs/design/09_ADR-008_サーバ分割計画.md`。ここでは判断のためのチェック
リストと、実際の構成図・却下済み代替案だけを要約する。判断に迷ったら
このファイルではなく元のADRを直接読むこと。

## 構成

```
ユーザー ──▶ worker-app(公開)
              Next.js(OpenNext)+ 静的アセット
              Auth.js(/api/auth/*, JWTセッション)
              Prisma依存なし
                │ service binding(内部呼び出し・リクエスト課金なし)
                ▼
            worker-api(非公開・binding経由のみ)
              Hono + lib/contracts(zod)
              Prisma + Neon
              /api/progress|submissions|notes|dashboard|guest-progress
              /internal/auth/*(認証用DB操作)
```

## チェックリスト(上から順に判定)

1. **Auth.jsのコールバック/サインイン/サインアウト自体のルートか?**
   (例: `/api/auth/[...nextauth]`, `/api/auth/signup`, `/api/auth/reset/*`)
   → Yes: worker-app。Auth.jsはNext.jsルーティングと密結合であり、
   分離コストが利得を上回るとADR-008で判断済み(3分割案は却下)。

2. **Prismaで直接DBの読み書きをするか?**
   → Yes: worker-api一択。worker-appはADR-008(T-503)でPrisma依存を
   完全に除去済みで、これを再度持ち込むことは禁止(サイズ予算の恒久対策を
   壊す)。

3. **認証済みユーザーのDB操作だが、事前認証(pre-auth)のCredentials照合や
   OAuthアカウントupsertか?**
   → Yes: `workers/api/src/routes/internalAuth.ts` の
   `/internal/auth/*` に置く。このルート群はworker-apiが公開ルートを
   持たないため、service binding経由でのみ到達可能で、追加の共有シークレットは
   不要(ADR-008 §2)。

4. **上記のいずれでもない一般API(進捗・提出・ノート・ダッシュボード・
   今後追加される新規リソース)か?**
   → worker-api。`app/api/[...path]/route.ts` のcatch-allが自動的に
   service binding経由で転送するため、Next.js側に新規Route Handlerを
   作る必要はない。

## 却下済みの代替案(繰り返さないこと)

- **3分割(app/auth/api)**: Auth.jsとNext.jsの密結合により切り出しコストが
  利得を上回るため却下。認証系の新機能を「auth Worker」に分離しようと
  提案しない。
- **Workers Paid移行だけで解決**: サイズ予算という構造問題は残るため、
  分割の代替にはならない(Paid移行自体は分割後も有効な追加手段)。
- **重量依存の総置換(Prisma→Kysely等)**: worker-apiが単独で予算超過した
  場合の次の一手であり、通常のAPIルート追加作業では対象外。

## サイズ予算(参考)

| Worker | 警告 | 失敗 |
|---|---|---|
| worker-app | 2.0MiB(gzip) | 2.5MiB(gzip) |
| worker-api | 2.0MiB(gzip) | 2.5MiB(gzip) |

新規依存を追加した場合は `npm run check:bundle-size` で両Workerの実測値を
確認する(SKILL.mdの検証ループ参照)。
