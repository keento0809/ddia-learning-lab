# CLAUDE.md — DDIA Learning Lab 実装憲法

## プロジェクト概要

DDIA(分散データシステム)の概念を学ぶバイリンガル(ja/en)学習Webアプリ。
仕様の正: docs/design/01*基本設計書.md, 02*詳細設計書.md
タスク定義の正: docs/design/03\_実装タスク分割書.md
現在の進捗: docs/tasks/STATUS.md

## 絶対規則(違反はレビューで差し戻し)

1. 指示されたタスクID(T-xxx)のスコープのみ実装する。Out of Scope欄の作業、
   頼まれていないリファクタ・依存追加・機能追加を行わない。
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
10. 依存する型・API・関数がリポジトリに存在しない場合、それは依存タスクが
    未マージである。実装せず「依存未充足」として停止・報告する。

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

## 完了報告フォーマット(タスク終了時に必ずこの形式で出力)

1. 実装サマリ(3行以内)
2. 変更ファイル一覧と各1行説明
3. 受入基準との対応表(基準→検証コマンド→結果)
4. 実行したコマンドの生ログ(最終成功分)
5. スコープ外と判断して実施しなかったこと
6. 設計との差異・懸念(なければ「なし」)
