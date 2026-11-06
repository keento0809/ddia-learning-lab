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
      "next@15.5.29が内蔵するpostcss(node_modules/next/node_modules/postcss)由来。" +
      "postcssはNext.jsのCSSビルドパイプライン(next build時)でのみ使われ、" +
      "wrangler dry-runで生成した実Workerバンドルに'postcss'文字列が0件であることを実測済み。" +
      "next@16系メジャーアップグレードが唯一の修正経路(T-724で対応)。",
  },
  {
    id: "GHSA-6g55-p6wh-862q",
    package: "postcss",
    reason:
      "GHSA-qx2v-qp2m-jg93と同一根拠(next内蔵postcss、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-r28c-9q8g-f849",
    package: "postcss",
    reason:
      "GHSA-qx2v-qp2m-jg93と同一根拠(next内蔵postcss、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-fxqj-rqcc-2cmp",
    package: "postcss",
    reason:
      "GHSA-qx2v-qp2m-jg93と同一根拠(next内蔵postcss、実バンドル非混入を実測済み)。",
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
      'package.jsonメタデータ中の`"test": "vitest run"`スクリプト定義の部分一致であり、' +
      "@vitest/mockerのコードではないことを目視確認済み)。修正経路はvitestのメジャー" +
      "アップグレードのみで、依存更新の別タスクで対応する。",
  },
  {
    id: "GHSA-qxg6-89mg-rqv8",
    package: "@vitest/mocker",
    reason:
      "GHSA-82fw-gwwq-j7x9と同一根拠(vitest内蔵@vitest/mocker)。T-710でwrangler dry-runにより生成したworker-app(worker.js)/worker-api(index.js)双方の実バンドルに'@vitest/mocker'文字列が0件であることを再実測済み。",
  },
  {
    id: "GHSA-3g3m-2fjr-6pw4",
    package: "glob",
    reason:
      "@opennextjs/cloudflare(devDependency)直下のglob@13および@opennextjs/aws -> @node-minify/core(overridesでglob@10.5.0)由来で、`opennextjs-cloudflare build`実行時にのみ使用される。T-710でwrangler dry-runにより生成したworker-app(worker.js)/worker-api(index.js)双方の実バンドルに'glob/dist'/'node-minify'文字列が0件、両ソースマップの収録元ファイル一覧にも該当ファイルが0件であることを実測済み。",
  },
  {
    id: "GHSA-g3hv-75wg-m249",
    package: "minimatch",
    reason:
      "@opennextjs/cloudflare -> glob@13、@opennextjs/aws -> @node-minify/core -> glob、および@typescript-eslint(eslint-config-next経由)由来で、ビルド/lint時にのみ使用される。T-710でwrangler dry-runにより生成したworker-app(worker.js)/worker-api(index.js)双方の実バンドルに'minimatch'文字列が0件、両ソースマップの収録元ファイル一覧にも該当ファイルが0件であることを実測済み。",
  },
  {
    id: "GHSA-5gmw-xhrv-c9v3",
    package: "tinypool",
    reason:
      "vitest@3.2.7(devDependency)が要求するtinypool由来で、`npm run test`実行時にのみ使用される。T-710でwrangler dry-runにより生成したworker-app(worker.js)/worker-api(index.js)双方の実バンドルに'tinypool'文字列が0件、両ソースマップの収録元ファイル一覧にも該当ファイルが0件であることを実測済み。修正経路はvitestのメジャーアップグレードのみで、依存更新の別タスクで対応する。",
  },
  {
    id: "GHSA-85c8-ppgw-ccpr",
    package: "tinypool",
    reason:
      "GHSA-5gmw-xhrv-c9v3と同一根拠(T-710、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-4qv8-2p9j-2685",
    package: "undici",
    reason:
      "miniflare@5.20261019.2-beta(devDependency)がundici@7.29.1を固定する由来。" +
      "jsdom(devDependency)も同じ版を使う。ローカル`wrangler dev`とテスト専用で、" +
      "wrangler dry-runの実バンドルに非混入を実測済み。" +
      "修正版undiciを要求するminiflare(wrangler@4.153.0相当)が公開14日を経過した時点で" +
      "更新して削除する。",
  },
  {
    id: "GHSA-f72v-6w45-q472",
    package: "undici",
    reason:
      "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-xjj6-f33q-929c",
    package: "undici",
    reason:
      "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-4w7w-5xrc-9h26",
    package: "undici",
    reason:
      "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-2m5v-pch6-74hx",
    package: "undici",
    reason:
      "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-qrxm-fqhp-jwvm",
    package: "undici",
    reason:
      "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-9fm3-97px-rjf6",
    package: "undici",
    reason:
      "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-55wc-3pg8-jfw6",
    package: "undici",
    reason:
      "GHSA-4qv8-2p9j-2685と同一根拠(miniflare固定のundici、実バンドル非混入を実測済み)。",
  },
];

const allowedIds = new Set(ALLOWED_ADVISORIES.map((a) => a.id));

function runAudit() {
  try {
    return execFileSync("npm", ["audit", "--json"], {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 32,
    });
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
  console.error(
    "[check-npm-audit] npm audit --jsonの出力が想定外の形式です(vulnerabilitiesキーが無い)。",
  );
  console.error(
    "  監査コマンド自体が脆弱性検出以外の理由で失敗した可能性があります。生出力:",
  );
  console.error(raw);
  process.exit(1);
}

const found = new Map();
for (const vuln of Object.values(data.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via === "object" && via.url) {
      const match = via.url.match(/GHSA-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/);
      if (match) {
        found.set(match[0], {
          severity: via.severity,
          title: via.title,
          url: via.url,
        });
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
