import { readdirSync } from "node:fs";
import path from "node:path";
import {
  convertV4MiniflareOptions,
  Miniflare,
  type V4MiniflareOptions,
} from "miniflare";

/**
 * T-710: miniflare 5の`workers`設定は新形式のため、既存のv4形式の設定を
 * 公式の変換関数で移行する。
 */
export function createMiniflare(options: V4MiniflareOptions): Miniflare {
  return new Miniflare(convertV4MiniflareOptions(options));
}

/**
 * T-710: convertV4MiniflareOptionsは`modulesRules`を変換できないため、
 * `wrangler deploy --dry-run --outdir`の出力を明示的なモジュール一覧として渡す。
 * T-502失敗→恒久対策のとおり、Prisma(runtime="workerd")のquery compiler WASMは
 * CompiledWasmモジュールとして解決させる必要がある。
 */
export function bundleModules(outDir: string) {
  return [
    { type: "ESModule" as const, path: path.join(outDir, "index.js") },
    ...readdirSync(outDir)
      .filter((file) => file.endsWith(".wasm"))
      .map((file) => ({
        type: "CompiledWasm" as const,
        path: path.join(outDir, file),
      })),
  ];
}
