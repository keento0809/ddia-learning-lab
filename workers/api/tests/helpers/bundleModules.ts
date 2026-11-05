import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * T-708: miniflare 5のconvertV4MiniflareOptionsは`modulesRules`を変換できないため、
 * `wrangler deploy --dry-run --outdir`の出力を明示的なモジュール一覧として渡す。
 * T-502失敗→恒久対策のとおり、Prisma(runtime="workerd")のquery compiler WASMは
 * CompiledWasmモジュールとして解決させる必要がある。
 */
export function bundleModules(outDir: string) {
  return [
    { type: "ESModule" as const, path: path.join(outDir, "index.js") },
    ...readdirSync(outDir)
      .filter((file) => file.endsWith(".wasm"))
      .map((file) => ({ type: "CompiledWasm" as const, path: path.join(outDir, file) })),
  ];
}
