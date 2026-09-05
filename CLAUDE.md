# CLAUDE.md — DDIA Learning Lab 実装憲法

## プロジェクト概要

DDIA(分散データシステム)の概念を学ぶバイリンガル(ja/en)学習Webアプリ。
仕様の正: docs/design/01*基本設計書.md, 02*詳細設計書.md
タスク定義の正: docs/design/03\_実装タスク分割書.md
現在の進捗: docs/tasks/STATUS.md

## 絶対規則(違反はレビューで差し戻し)

1. 指示されたタスクID(T-xxx)のスコープのみ実装する。Out of Scope欄の作業、
   頼まれていないリファクタ・依存追加・機能追加を行わない。
   1a. 着手前に docs/tasks/STATUS.md で、指示されたタスクIDが既存の採番と
   重複していないか確認すること。重複の疑いがあれば実装を止めて報告し、
   指示を待つ(過去に同一IDが3つの異なる作業に使われた事故があり、
   T-705a/b/cのように事後の枝番修正が必要になった。詳細: STATUS.md 2026-08-08)。
2. lib/contracts/ 配下の型・スキーマは変更禁止(変更が必要なら実装を止めて
   その旨を報告し、指示を待つ)。
3. モック・スタブ・TODOコメントで「実装したことにする」の禁止。受入基準を
   満たせない場合は、満たせない理由を報告して止まる。
4. テストを弱めて(expect緩和・skip・timeout延長)通すことの禁止。
5. UI文言のハードコード禁止。必ず messages/{ja,en}.json に両言語追加する。
   コンテンツ系ファイルは ja/en を必ず対で作成・更新する。
6. 教材・コメント・テストデータに原著『Designing Data-Intensive Applications』
   本文の引用・翻訳を含めない(トピックの独自解説のみ)。
7. 秘密情報(.env)をコミットしない。

## 並列実行ルール

8. あなたは背景セッションとして専用worktreeで動作している場合がある。
   自分のタスク(T-xxx)のスコープ外のファイルには一切触れない。
   worktreeの外(他セッションの作業)を推測して先回りしない。
9. 作業完了時は必ずブランチをコミット+pushしてから完了報告する
   (セッション削除でworktreeは消えるため、push漏れ=成果物消失)。
   9a. PRを作成する場合は `gh pr create --base main` のように base を明示
   指定すること。検証対象ブランチ(mainではないブランチ)をbaseにしたまま
   作成してしまう事故が過去複数回発生している(詳細: STATUS.md 2026-08-08)。
10. 依存する型・API・関数がリポジトリに存在しない場合、それは依存タスクが
    未マージである。実装せず「依存未充足」として停止・報告する。
    10a. 開発サーバー等のプロセスをkill/pkillする際は、自セッションが起動した
    PIDを明示的に指定するか、他の長時間稼働セッションを誤って巻き込まない
    十分に限定的なパターンを使うこと(`pkill -f "wrangler dev"`のような
    広すぎるパターンで無関係セッションのプロセスを誤って停止させた事故が
    過去に発生している。詳細: STATUS.md 2026-08-19)。

## ループ・ハーネス規則(docs/design/08 参照)

11. 検証コマンドの実行結果は必ず出力に表示する(サイレント実行禁止)。
    /goal の評価器はトランスクリプトしか見ないため、表示されていない検証は
    存在しないのと同じである。UI系タスクは verify-webapp スキルの手順で
    実挙動を検証し、完了報告前に qa-evaluator の採点を受ける。
    11a. UI系タスクでなくても、既存UIコンポーネントに1行でも変更を加えた場合は
    完了報告前にqa-evaluatorでの回帰確認を行うこと。「このタスクはUI系
    ではない」という自己判断だけで省略しない(過去に機械的なlint適合や
    RSC境界修正のための変更だけのつもりが実際にはUI操作性を壊しており、
    qa-evaluator未実施のまま見逃されかけた事例が複数回ある。
    詳細: STATUS.md 2026-07-18)。
12. 恒久修正原則: 失敗を個別修正で終わらせない。同種の失敗を防ぐ恒久対策を
    環境側(常時知るべき事実→CLAUDE.md / 領域規約→.claude/rules / 手順→skills /
    確実に止める操作→settings.json deny)のどこに書くか検討し、その場で
    実際に該当ファイルへ反映する(検討だけで終わらせない)。STATUS.md
    決定事項ログには「失敗→恒久対策」に加え、どこへ反映したかを1行で記録
    する(過去にSTATUS.mdへの記録だけで昇格が行われず、同種の失敗が繰り返し
    再発した反省。詳細: STATUS.md 2026-08-29)。
13. クラウドセッション(claude --cloud)でpush/PR作成を伴うタスクを
    実行する場合、作業着手前に必ず `git remote -v` を実行し、origin
    リモートが正しく設定されているか確認すること。設定されていない、
    または後続の git push で権限エラーが想定される場合は、実装に
    着手せずその旨を直ちに報告して停止する(実装完了後に判明すると
    手戻りが大きいため、必ず着手前に確認する)。

## 開発コマンド(完了宣言前に全て成功させること)

- npm run lint / npm run typecheck / npm run test
- npm run validate:content # T-006以降
- npm run build
- npm run test:e2e # E2Eを含むタスクのみ

## コーディング規約(要点)

- TypeScript strict。any禁止(やむを得ない場合は理由コメント必須)
- サーバ状態=TanStack Query / クライアント状態=Zustand(docs/design/02 §6)
- API エラーは RFC 9457 Problem Details(docs/design/02 §3)
- コミット: Conventional Commits。1論理変更=1コミット

## インフラ(ADR-007)

- ホスティング: Cloudflare Workers + 静的アセット(OpenNextアダプタ)
- DB: Neon PostgreSQL(Prisma経由)
- ストレージ: Cloudflare R2
- 詳細: docs/design/05*ADR-007*インフラ選定.md

## ハーネス構成

- .claude/agents/: spec-checker(設計照合) / test-integrity-reviewer(テスト誠実性) /
  qa-evaluator(敵対的QA・採点はハード閾値: 全観点4以上)
- .claude/rules/: 領域規約(i18n.md / cloudflare-workers.md / security.md /
  tooling.md)。関連する変更を行う際は必ず目を通すこと
- .claude/skills/verify-webapp/: UI変更のend-to-end検証手順
- .claude/settings.json: 破壊的操作のdeny(環境による強制層)
- グレーディング基準: docs/design/08 §3.4

## 完了報告フォーマット(タスク終了時に必ずこの形式で出力)

1. 実装サマリ(3行以内)
2. 変更ファイル一覧と各1行説明
3. 受入基準との対応表(基準→検証コマンド→結果)
4. 実行したコマンドの生ログ(最終成功分)
5. スコープ外と判断して実施しなかったこと
6. 設計との差異・懸念(なければ「なし」)
