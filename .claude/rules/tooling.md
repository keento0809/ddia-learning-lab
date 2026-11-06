# 共有設定ファイル・ツーリング規約

- ビルド/検証用に一時生成する新規ディレクトリ(dry-runバンドル等)を追加する
  際は、`.gitignore`と`eslint.config.mjs`の両方に追記すること(ESLintは
  `.gitignore`を見ないため、`.gitignore`だけでは対象から除外されない)。
  命名パターンは完全一致の固定文字列ではなく、将来の命名バリエーション
  (検証対象名の挿入等)を許容する形のglobで書くこと(詳細: STATUS.md
  2026-07-18, 2026-07-30)。
- `package.json`の`scripts`に新規キー(特に`pre<script>`フック)を追加する
  際は、`grep -n '"pre'`等で既存の同名キーがないか必ず確認してから追加
  すること。`package.json`のような複数タスクが独立に触りうる共有設定
  ファイルは、PRのdiffレビューで「同名キーの2回目の出現」を明示的に
  確認する。マージ後は`npm ci`相当のクリーン環境で対象コマンドを1回実行し、
  pre-hookが期待どおり発火することを確認すること(同種の重複キー事故が
  3タスクにまたがり再発した実績がある。詳細: STATUS.md 2026-07-19以降、
  T-109/T-107b/T-102)。
- 依存更新で採用する版は、間接依存を含め公開から14日以上経過したものに限る
  (Dependabotの`cooldown.default-days: 14`と同じ基準)。手動更新では
  `npm install --before=<14日前の日付>`で解決し、lockfileの変更分を公開日と
  突き合わせて確認する。緊急の修正が14日未満の版にしかない場合は独断で採用せず、
  報告して判断を仰ぐ(詳細: STATUS.md 2026-11-06、T-710)。
- Dependabot PRが`npm ci`の`Missing: ... from lock file`で失敗する場合は、PRごとに
  lockfileを直さず、任意peerのネストエントリがDependabotの再生成で消えていないかを
  確認し、`package.json`の`overrides`で単一バージョンへ統一して解消すること。
  `overrides`の`@swc/helpers`は`next`の固定版と`@swc/core`の任意peerの不一致を
  解消するためのもので、`next`更新時に要否を再確認すること(詳細: STATUS.md 2026-11-06、
  T-711)。
- `package.json`/`package-lock.json`/`overrides`を変更したタスクは、PR作成前に
  `npm run verify:ci`を実行すること。既存の`node_modules`が残ったままの検証では、
  rootに宣言のない依存が解決できてしまい、CIの`npm ci`で初めて失敗する(T-710で
  `prisma: not found`が発生)。rootの`scripts`やコードから使うパッケージは
  ワークスペースの巻き上げに頼らず、rootの`package.json`に宣言すること
  (詳細: STATUS.md 2026-11-06、T-727)。
