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
      "next@15.5.23が内蔵するpostcss(node_modules/next/node_modules/postcss)由来。" +
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
    id: "GHSA-f88m-g3jw-g9cj",
    package: "sharp",
    reason:
      "next@15.5.23が要求するsharp@0.34.5由来(next/image最適化用、Node.js実行時のみ使用)。" +
      "sharpはネイティブバイナリでworkerd(V8 isolate)上では動作できずWorkerバンドルに" +
      "同梱不可能な構造。wrangler dry-runの実Workerバンドルに'sharp'/'libvips'文字列が" +
      "0件であることを実測済み。next@16系メジャーアップグレードが唯一の修正経路。",
  },
  {
    id: "GHSA-8xcm-r25x-g524",
    package: "undici",
    reason:
      "miniflare(ローカル`wrangler dev`用のWorkers runtimeエミュレータ、devDependency経由)" +
      "が内蔵するundici由来。本番Workerは実際のCloudflareエッジ(workerd)で実行され" +
      "miniflare/undiciを一切含まない。wrangler dry-runの実Workerバンドルに'undici'文字列が" +
      "0件であることを実測済み。miniflare@5系alphaへのメジャーアップグレードが唯一の修正経路。",
  },
  {
    id: "GHSA-4cwx-7wf7-3272",
    package: "undici",
    reason: "GHSA-8xcm-r25x-g524と同一根拠(miniflare内蔵undici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-m8rv-5g2x-5cg5",
    package: "undici",
    reason: "GHSA-8xcm-r25x-g524と同一根拠(miniflare内蔵undici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-jr45-8vmc-qm54",
    package: "undici",
    reason: "GHSA-8xcm-r25x-g524と同一根拠(miniflare内蔵undici、実バンドル非混入を実測済み)。",
  },
  {
    id: "GHSA-v3r7-h72x-cjcm",
    package: "undici",
    reason: "GHSA-8xcm-r25x-g524と同一根拠(miniflare内蔵undici、実バンドル非混入を実測済み)。",
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
