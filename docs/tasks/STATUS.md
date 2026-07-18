# 実装進捗 (WBS: docs/design/03\_実装タスク分割書.md)

最終更新: 2026-07-18

## Phase 0: 基盤

| タスク | 名称                         | サイズ | 状態 | ブランチ/PR | 備考 |
| ------ | ---------------------------- | ------ | ---- | ----------- | ---- |
| T-000  | Walking Skeleton             | L      | 🔄   | feat/T-000-walking-skeleton | docs/skeleton-notes.md参照 |
| T-001  | リポジトリ基盤整備           | M      | 🔄   | feat/T-001-repo-foundation | Tailwind/ESLint(no-literal-jsx-text)/Prettier/Vitest追加。lint/typecheck/test/build全green |
| T-002  | CIパイプライン               | S      | 🔄   | feat/T-002-ci | lint→typecheck→unit→build(直列)+ADR-007バンドルサイズゲート(2.5MiB警告/3MiB失敗)。content-validate/e2eはplaceholder(if: false) |
| T-003  | i18n骨格                     | M      | ⏳   | —           |      |
| T-010  | コントラクト定義             | M      | 🔄   | feat/T-010-contracts |      |
| T-004  | DB/Prisma                    | M      | 🔄   | feat/T-004-db-prisma | prisma/schema.prisma(02§2.1全8テーブル)+初回migration+seed(2名+進捗3件)+lib/db.ts(driver adapter)+docker-compose.test.yml+CRUD統合テスト8件。lint/typecheck/test/build全green |
| T-005  | 認証                         | M      | ⏳   | —           |      |
| T-006  | コンテンツビルドパイプライン | L      | ⏳   | —           |      |
| T-007  | 共通レイアウト               | M      | ⏳   | —           |      |

## Phase 1: MVP

| タスク  | 名称                        | サイズ | 状態 | ブランチ/PR | 備考 |
| ------- | --------------------------- | ------ | ---- | ----------- | ---- |
| T-101   | カリキュラム一覧 (S-02)     | M      | ⏳   | —           |      |
| T-102   | モジュール詳細 (S-03)       | S      | ⏳   | —           |      |
| T-103   | レッスンページ (S-04)       | L      | ⏳   | —           |      |
| T-104   | 進捗API                     | M      | ⏳   | —           |      |
| T-105   | 進捗クライアント統合        | M      | ⏳   | —           |      |
| T-106   | クイズ (S-05)               | M      | ⏳   | —           |      |
| T-107a  | Workerハーネス              | M      | ⏳   | —           |      |
| T-107b  | 採点器 (grader)             | M      | ⏳   | —           |      |
| T-107c  | Runner統合                  | M      | ⏳   | —           |      |
| T-108   | 演習ページ (S-06)           | L      | ⏳   | —           |      |
| T-109   | 提出API                     | S      | ⏳   | —           |      |
| T-110-1 | Part I 教材 JA: モジュール1 | M      | ⏳   | —           |      |
| T-110-2 | Part I 教材 JA: モジュール2 | M      | ⏳   | —           |      |
| T-110-3 | Part I 教材 JA: モジュール3 | M      | ⏳   | —           |      |
| T-110-4 | Part I 教材 JA: モジュール4 | M      | ⏳   | —           |      |
| T-111-1 | Part I 教材 EN: モジュール1 | M      | ⏳   | —           |      |
| T-111-2 | Part I 教材 EN: モジュール2 | M      | ⏳   | —           |      |
| T-111-3 | Part I 教材 EN: モジュール3 | M      | ⏳   | —           |      |
| T-111-4 | Part I 教材 EN: モジュール4 | M      | ⏳   | —           |      |
| T-112   | ダッシュボード (S-07)       | M      | ⏳   | —           |      |
| T-113   | ゲスト進捗                  | S      | ⏳   | —           |      |

## Phase 2: 分散データ編

| タスク  | 名称                         | サイズ | 状態 | ブランチ/PR | 備考 |
| ------- | ---------------------------- | ------ | ---- | ----------- | ---- |
| T-201   | SQLランナー                  | M      | ⏳   | —           |      |
| T-202   | SQL演習UI                    | S      | ⏳   | —           |      |
| T-203   | Viz共通基盤                  | M      | ⏳   | —           |      |
| T-204   | LsmTreeViz                   | L      | ⏳   | —           |      |
| T-205   | HashRingViz                  | L      | ⏳   | —           |      |
| T-206   | ReplicationLagViz            | L      | ⏳   | —           |      |
| T-207   | RaftViz                      | L      | ⏳   | —           |      |
| T-208   | IsolationViz                 | L      | ⏳   | —           |      |
| T-210-1 | Part II 教材 JA: モジュール5 | M      | ⏳   | —           |      |
| T-210-2 | Part II 教材 JA: モジュール6 | M      | ⏳   | —           |      |
| T-210-3 | Part II 教材 JA: モジュール7 | M      | ⏳   | —           |      |
| T-210-4 | Part II 教材 JA: モジュール8 | M      | ⏳   | —           |      |
| T-210-5 | Part II 教材 JA: モジュール9 | M      | ⏳   | —           |      |
| T-211-1 | Part II 教材 EN: モジュール5 | M      | ⏳   | —           |      |
| T-211-2 | Part II 教材 EN: モジュール6 | M      | ⏳   | —           |      |
| T-211-3 | Part II 教材 EN: モジュール7 | M      | ⏳   | —           |      |
| T-211-4 | Part II 教材 EN: モジュール8 | M      | ⏳   | —           |      |
| T-211-5 | Part II 教材 EN: モジュール9 | M      | ⏳   | —           |      |

## Phase 3: 派生データ編・付加機能

| タスク  | 名称                           | サイズ | 状態 | ブランチ/PR | 備考 |
| ------- | ------------------------------ | ------ | ---- | ----------- | ---- |
| T-301-1 | Part III 教材 JA: モジュール10 | M      | ⏳   | —           |      |
| T-301-2 | Part III 教材 JA: モジュール11 | M      | ⏳   | —           |      |
| T-301-3 | Part III 教材 JA: モジュール12 | M      | ⏳   | —           |      |
| T-301-4 | Part III 教材 EN: モジュール10 | M      | ⏳   | —           |      |
| T-301-5 | Part III 教材 EN: モジュール11 | M      | ⏳   | —           |      |
| T-301-6 | Part III 教材 EN: モジュール12 | M      | ⏳   | —           |      |
| T-302   | キャップストーン(分岐シナリオ) | L      | ⏳   | —           |      |
| T-303   | バッジ                         | S      | ⏳   | —           |      |
| T-304   | 修了証+サーバ側再検証          | L      | ⏳   | —           |      |
| T-305   | 用語集 (S-08)                  | S      | ⏳   | —           |      |
| T-306   | 検索 (S-09)                    | M      | ⏳   | —           |      |
| T-307   | ノート機能                     | M      | ⏳   | —           |      |

## Phase 4: 磨き込み

| タスク | 名称                 | サイズ | 状態 | ブランチ/PR | 備考 |
| ------ | -------------------- | ------ | ---- | ----------- | ---- |
| T-401  | a11y監査対応         | M      | ⏳   | —           |      |
| T-402  | 性能最適化           | M      | ⏳   | —           |      |
| T-403  | E2E拡充              | M      | ⏳   | —           |      |
| T-404  | EN校閲・整合最終確認 | M      | ⏳   | —           |      |

## スキル抽出タスク(docs/design/08 §3.8)

| タスク | 名称                                           | サイズ | 状態 | 実施タイミング                        |
| ------ | ---------------------------------------------- | ------ | ---- | ------------------------------------- |
| SK-01  | content-authoring スキル抽出                   | S      | ⏳   | T-110-1 マージ直後                    |
| SK-02  | exercise-authoring(SK-01のreferenceとして開始) | S      | ⏳   | T-110-1 マージ直後                    |
| SK-03  | api-route スキル抽出                           | S      | ⏳   | T-104 マージ直後                      |
| SK-04  | viz-component スキル抽出                       | S      | ⏳   | T-204 マージ直後・Wave 8 投入前に必須 |
| SK-05  | translate-module スキル抽出                    | S      | ⏳   | T-111-1 マージ直後                    |

---

## 状態の凡例

| 記号 | 意味                   |
| ---- | ---------------------- |
| ⏳   | 未着手                 |
| 🔵   | 進行中                 |
| 🔄   | レビュー中             |
| ⛔   | ブロック中(依存待ち等) |
| ✅   | 完了・マージ済み       |

---

## 決定事項ログ(設計からの逸脱・追加判断)

- 2026-07-17: ADR-007採用(Cloudflare Workers)。T-000検証項目にwrangler preview上の動作確認を追加。T-002にサーババンドルサイズゲートを追加。T-304の再検証実行環境をGitHub Actionsに変更。
- 2026-07-18: T-000実施中、`next-mdx-remote` + `node:fs/promises` によるリクエスト時MDX読込がwrangler preview環境で `[unenv] fs.readFile is not implemented yet!` により失敗することを確認(Workersにはリクエスト時に読めるファイルシステムが存在しないため)。`@next/mdx` によるビルド時コンパイルに切替えて解消。T-006(コンテンツビルドパイプライン)は `lib/content.ts` を実行時fs読込に依存させず、ビルド時に静的解決する設計とすること(詳細: docs/skeleton-notes.md)。
- 2026-07-18: T-001で02§5.2の「no-literal-jsx-text」規約を `eslint-plugin-react` の `react/jsx-no-literals` ルールで実装(同名の独立ルールは存在しないため)。このルールはJSX子要素直下の文字列リテラルを全て(句読点含む)禁止するため、`{t.x}: {y}` のように翻訳済み値の間に裸の記号(`:` `(` `)` など)を置く書き方はエラーになる。**恒久対策**: 今後同様のケースは `{`${t.x}: ${y}`}` のように単一のテンプレートリテラル式コンテナへ畳み込むこと(components/Lab.tsxで実施済み)。
- 2026-07-18: T-001の「ディレクトリ骨格(02§1どおり)」は、T-001のOut of Scope(機能実装/i18n/DB)およびCLAUDE.md規則3(モック・スタブ禁止)と衝突するため、app/[locale]再構成・app/api・prisma/schema.prisma・lib/db.ts・lib/content.ts・components/{viz,lab,mdx,ui}等の空スタブは作成しなかった。実体を伴わないディレクトリ作成は「実装したことにする」偽装と区別がつかないため、各ディレクトリは対応タスク(T-003/T-004/T-006/T-007/T-101+/T-203+)が実装と同時に作成する方針とする。T-001では既存の app/, components/, content/, lib/, messages/, types/ に加え、Vitestの実体テストを伴う tests/unit/ のみを新設した。
- 2026-07-18: T-001はツーリング整備タスクでUI新規実装を伴わないため当初qa-evaluatorを未実施だったが、components/Lab.tsx(既存UI)にlint適合のための機械的変更を加えていたため追加でqa-evaluatorを実施。ブラウザ操作(合格/タイムアウト/エラー、ja/en)で旧コミット(93fe2d5)と表示結果が完全一致することを確認しPASS。**恒久対策**: 既存UIコンポーネントに1行でも変更を加えた場合は、そのタスクが「UI系タスク」でなくてもqa-evaluatorでの回帰確認を完了報告前に行うこと。副次的発見として `lib/runner/harness.worker.ts` のエラーメッセージがロケール非依存で日本語ハードコードのまま(T-000由来の既存不具合)であることを検出。修正は本タスクのスコープ外のため実施せず、後続タスク(T-107b/T-107c想定)でのフォローアップ候補として記録。
- 2026-07-18: T-002実施中、GitHub Actionsのワークフローが未マージのためローカルでの実行結果確認ができず、`act`もCI環境に未導入だったため、`actionlint`(brewで導入)によるワークフローYAMLのスキーマ検証+全コマンド(lint/typecheck/test/build)のローカルexit 0確認で受入基準を代替した(WBS T-002本文に明記された代替手段)。**恒久対策**: `actionlint`は意図的な`if: false`プレースホルダーjobを`constant expression in condition`として警告するが、これはWBS T-002が明示的に要求する設計(content-validate/e2eをT-006/T-403待ちのplaceholderとして先に定義)であり偽陽性として無視してよい。また、`wrangler deploy --dry-run`が生成する`.worker-dryrun/`配下のバンドル済みJSは`.gitignore`だけでは`npm run lint`の対象から除外されず(ESLintは.gitignoreを見ない)lintが壊れたため、`eslint.config.mjs`のignoresにも同ディレクトリを追加。**今後、ビルド/検証用に一時生成する新規ディレクトリを追加する際は、`.gitignore`と`eslint.config.mjs`の両方に追記すること。**
- 2026-07-18: T-010実施。`lib/contracts/`に03文書T-010行の成果物①〜⑤(API I/O zod、演習YAML zod、Worker⇄Mainメッセージ、SimEngine、slugマニフェスト)を実装し、正常系/異常系パーステストを各スキーマ群に整備(36 test)。依存追加: `zod`(^4.4.3、当タスクの受入基準が明示的に要求)。**設計差異(要判断)**: 03文書T-101/T-106行は「module.yamlスキーマ(T-010の型)」「quiz.yaml」を前提とするが、T-010行の公式成果物リスト①〜⑤にも02文書にもmodule.yaml/quiz.yamlのフィールド定義が存在しない。今回はスコープを03文書T-010行の①〜⑤に厳密限定し、これらのスキーマは追加しなかった(CLAUDE.md規則1: Out of Scope作業の禁止)。**恒久対策**: T-101/T-106着手前に、①追加の型確定タスクとして対応するか、②02文書へmodule.yaml/quiz.yaml構造を追記のうえ本タスクを再オープンするかの判断が必要(未解決のまま着手すると型がその場しのぎになるリスクがある)。
- 2026-07-18: T-004実施。インストールされた`prisma@7.8.0`はNode `^20.19 || ^22.12 || >=24.0`のみサポートしており、ローカルのデフォルトNode(v23.11.0、非LTS)では`prisma`コマンドがnpm engine警告のみでサイレントにexit 1し原因特定が困難だった(CIの`node-version: "22"`は該当範囲内のため無関係)。nodenvで22.15.0を導入して解消。**恒久対策**: 今後ローカルでPrisma CLIを直接実行する作業(T-005/T-104/T-109等)では、まず`node --version`を確認し、範囲外なら`nodenv install`等でCIと同系統(22.x)に揃えてから実行すること。
- 2026-07-18: T-004実施。Prisma 7では`schema.prisma`の`datasource`ブロックに`url`/`directUrl`を書くと`P1012 (property no longer supported)`で検証エラーになる(旧versionからの破壊的変更)。接続情報は`prisma.config.ts`の`datasource.url`(migrate/introspection用、`DIRECT_URL`優先)と、`PrismaClient`コンストラクタに渡す`adapter`(`@prisma/adapter-pg`、`DATABASE_URL`、lib/db.ts)の二箇所に分離する新方式に対応した。生成されたクライアント(`lib/generated/prisma/`)は`.gitignore`対象とし、`package.json`に`postinstall: prisma generate`を追加して`npm ci`後に必ず再生成されるようにした。**恒久対策**: 今後`lib/db.ts`を利用する全タスク(T-005/T-104/T-109等)は、DB接続を追加・変更する際にschema.prismaへ`url`を書き戻さないこと(P1012で即座に検証エラーになるため事故りにくいが、代わりに`prisma.config.ts`を編集する)。
