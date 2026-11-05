#!/usr/bin/env node
// T-701(ADR-011 §3.5 DP-1)恒久対策: `npm audit --audit-level=high`は「ツリー内に
// high/critical が1件でもあれば全体を失敗させる」全否定ゲートで、既知の恒久未修正
// リスク(下記ALLOWED_ADVISORIES)を個別に許容できない。かといって`npm audit --omit`や
// package.jsonのoverridesでパッケージ単位に黙らせると、同じパッケージに将来出る
// "別の"アドバイザリまで見逃す。そこで実際のGHSAアドバイザリID単位の許容リストを持ち、
// リスト外のアドバイザリが1件でも検出されたら(severityを問わず)失敗させる。
//
// ALLOWED_ADVISORIESの各エントリは、T-701セッションで実施した実測(worker-app/
// worker-apiそれぞれを`wrangler deploy --dry-run --outdir`で実バンドル化し、
// postcss/sharp/undici の文字列が0件だったこと)により、本番デプロイされる
// Workerバンドルには混入しないと確認済みの既知残存リスクのみを対象とする。
import { execFileSync } from "node:child_process";

const ALLOWED_ADVISORIES = [
  {
    id: "GHSA-qx2v-qp2m-jg93",
    package: "postcss",
    reason:
      "next@15.5.28が内蔵するpostcss(node_modules/next/node_modules/postcss)由来。" +
      "postcssはNext.jsのCSSビルドパイプライン(next build時)でのみ使われ、" +
      "wrangler dry-runで生成した実Workerバンドルに'postcss'文字列が0件であることを実測済み。" +
      "next@16系メジャーアップグレードが唯一の修正経路(T-705検討済み、未着手)。",
  },
  {
    id: "GHSA-6g55-p6wh-862q",
    package: "postcss",
    reason: "GHSA-qx2v-qp2m-jg93と同一根拠(next内蔵postcss、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-r28c-9q8g-f849",
    package: "postcss",
    reason: "GHSA-qx2v-qp2m-jg93と同一根拠(next内蔵postcss、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-fxqj-rqcc-2cmp",
    package: "postcss",
    reason: "GHSA-qx2v-qp2m-jg93と同一根拠(next内蔵postcss、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-82fw-gwwq-j7x9",
    package: "@vitest/mocker",
    reason:
      "vitest@3.2.7(devDependency)が要求する@vitest/mocker由来。vitest/mockerは" +
      "`npm run test`実行時にのみ使用され、アプリケーションコードから一切importされない。" +
      "wrangler dry-runで生成したworker-app(worker.js)/worker-api(index.js)双方の" +
      "実バンドルに'@vitest/mocker'文字列およびvitest/mocker由来コードが0件、両ソース" +
      "マップの収録元ファイル一覧にも'vitest'を含むファイルが0件であることを実測済み" +
      "(worker-api側で1件ヒットした'vitest'文字列は無関係な別パッケージが内包する" +
      "package.jsonメタデータ中の`\"test\": \"vitest run\"`スクリプト定義の部分一致であり、" +
      "@vitest/mockerのコードではないことを目視確認済み)。npm auditが提示する修正経路は" +
      "vitest@5.0.0へのメジャーアップグレード(未検証のため見送り)。",
  },
  // T-708: 以下はnext@15.5.28/@opennextjs/cloudflare@1.20.13/wrangler@4.152.0への更新後に
  // 残存または混入した開発・ビルド時ツール由来のもの。`npm audit --omit=dev`に現れないこと、
  // およびwrangler dry-runのworker.js/index.js本体に当該パッケージのコードが無いことを
  // 実測済み(ソースマップ収録元も0件。worker-appのマップはhandler.mjsを1ソースとして
  // 扱うため本文スキャンを主な根拠とする)。各項目の解消条件はreasonに記載する。
  {
    id: "GHSA-5gmw-xhrv-c9v3",
    package: "tinypool",
    reason:
      "vitest@3.2.7(devDependency)が要求するtinypool@1系由来。`npm run test`実行時の" +
      "ワーカー管理にのみ使用され、アプリケーションコードからimportされない。実バンドルに" +
      "非混入を実測済み。修正版は2.1.2以上で1系には無く、解消経路はvitest@4以上への" +
      "メジャーアップグレード(T-719)。",
  },
  {
    id: "GHSA-85c8-ppgw-ccpr",
    package: "tinypool",
    reason: "GHSA-5gmw-xhrv-c9v3と同一根拠(vitest内蔵tinypool、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-qxg6-89mg-rqv8",
    package: "@vitest/mocker",
    reason: "GHSA-5gmw-xhrv-c9v3と同一根拠(vitestのテスト実行時のみ、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-5j98-mcp5-4vw2",
    package: "glob",
    reason:
      "T-708の@opennextjs/cloudflare更新で新たに混入した項目(mainには無い)。" +
      "@opennextjs/aws -> @node-minify/core@9.0.2がglob@10.3.3を固定する。脆弱性はglobの" +
      "CLI(-c/--cmd)に限られ、本プロジェクトはビルドツール内のライブラリ利用のみでCLIを" +
      "実行しない。実バンドルに非混入を実測済み。解消には上流の依存更新が必要。",
  },
  {
    id: "GHSA-3g3m-2fjr-6pw4",
    package: "glob",
    reason:
      "@opennextjs/cloudflare直下のglob@13.0.6および@node-minify/core配下のglob由来。" +
      "ビルド時のみ実行され、実バンドルに非混入を実測済み。修正版は14.0.2以上だが" +
      "@opennextjs/cloudflare最新版も^13を要求するため、解消には上流の依存更新が必要。",
  },
  {
    id: "GHSA-g3hv-75wg-m249",
    package: "minimatch",
    reason:
      "@opennextjs/cloudflareのビルド依存およびeslint-config-next経由の" +
      "@typescript-eslint/typescript-estree配下のminimatch由来。ビルド/lint時のみ実行され、" +
      "実バンドルに非混入を実測済み。解消には上流の依存更新が必要。",
  },
  {
    id: "GHSA-4qv8-2p9j-2685",
    package: "undici",
    reason:
      "miniflare@5.20261019.2-beta(devDependency)がundici@7.29.1を固定する由来。" +
      "ローカル`wrangler dev`とテスト専用で、実バンドルに非混入を実測済み。" +
      "修正版undiciを要求するminiflare(wrangler@4.153.0相当)が公開14日を経過した時点で" +
      "更新して削除する。",
  },
  {
    id: "GHSA-f72v-6w45-q472",
    package: "undici",
    reason: "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-xjj6-f33q-929c",
    package: "undici",
    reason: "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-4w7w-5xrc-9h26",
    package: "undici",
    reason: "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-2m5v-pch6-74hx",
    package: "undici",
    reason: "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-qrxm-fqhp-jwvm",
    package: "undici",
    reason: "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-9fm3-97px-rjf6",
    package: "undici",
    reason: "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-55wc-3pg8-jfw6",
    package: "undici",
    reason: "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
];

const allowedIds = new Set(ALLOWED_ADVISORIES.map((a) => a.id));

function runAudit() {
  try {
    return execFileSync("npm", ["audit", "--json"], { encoding: "utf-8", maxBuffer: 1024 * 1024 * 32 });
  } catch (err) {
    // npm auditは脆弱性を検出しただけでexit 1を返す。標準出力に本体のJSONが乗るため
    // エラー時もerr.stdoutから拾う(エラー自体はここでは無視し、後段のロジックで判定する)。
    if (err.stdout) return err.stdout;
    throw err;
  }
}

const raw = runAudit();
const data = JSON.parse(raw);

// npm auditは脆弱性検出以外の理由(レジストリ到達不能・認証エラー等)でも非ゼロ終了し、
// その場合stdoutには`vulnerabilities`キーを持たないエラーJSON({"error": {...}}等)が
// 乗る。これを「vulnerabilities未検出」と誤読すると監査コマンド自体の失敗をCI green
// として見逃す(ゲートのfail-open)。`vulnerabilities`キーの不在を監査失敗として扱う。
if (!("vulnerabilities" in data)) {
  console.error("[check-npm-audit] npm audit --jsonの出力が想定外の形式です(vulnerabilitiesキーが無い)。");
  console.error("  監査コマンド自体が脆弱性検出以外の理由で失敗した可能性があります。生出力:");
  console.error(raw);
  process.exit(1);
}

const found = new Map();
for (const vuln of Object.values(data.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via === "object" && via.url) {
      const match = via.url.match(/GHSA-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/);
      if (match) {
        found.set(match[0], { severity: via.severity, title: via.title, url: via.url });
      }
    }
  }
}

const unknown = [...found.entries()].filter(([id]) => !allowedIds.has(id));
const knownPresent = [...found.entries()].filter(([id]) => allowedIds.has(id));

console.log(`[check-npm-audit] 検出されたアドバイザリ: ${found.size}件`);
for (const [id, info] of found.entries()) {
  const status = allowedIds.has(id) ? "許容済み(既知)" : "未許容(新規)";
  console.log(`  - ${id} [${info.severity}] ${status}: ${info.title}`);
}

if (unknown.length > 0) {
  console.error("");
  console.error(
    `[check-npm-audit] 許容リスト外の脆弱性が${unknown.length}件検出されました。CIを失敗させます。`,
  );
  for (const [id, info] of unknown) {
    console.error(`  - ${id} [${info.severity}] ${info.title} (${info.url})`);
  }
  console.error("");
  console.error(
    "対応: 新規/未評価の脆弱性です。npm audit fix等で修正するか、実バンドルへの実害がないと" +
      "実測で確認できた場合のみ scripts/check-npm-audit.mjs の ALLOWED_ADVISORIES に理由付きで追加してください。",
  );
  process.exit(1);
}

console.log("");
console.log(
  `[check-npm-audit] OK: 検出された脆弱性は全て許容リスト内(${knownPresent.length}/${allowedIds.size}件が現存)です。`,
);
