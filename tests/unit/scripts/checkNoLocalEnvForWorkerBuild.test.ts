import { describe, expect, it } from "vitest";
import { ENV_FILE_CANDIDATES, findLocalEnvFiles } from "../../../scripts/check-no-local-env-for-worker-build.mjs";

/**
 * T-705: ビルド成果物へのシークレット混入対策(check-no-local-env-for-worker-build.mjs)。
 * 実ファイルI/Oは行わず、existsSyncを注入して検証する
 * (generateWorkerCspHeaders.test.tsのresolveWorkerChunkFileと同じパターン)。
 */
describe("findLocalEnvFiles", () => {
  it("候補ファイルが1つも存在しなければ空配列を返す(CI相当: .env非存在)", () => {
    const result = findLocalEnvFiles("/project", () => false);
    expect(result).toEqual([]);
  });

  it(".envのみ存在する場合、.envだけを検出する(手動デプロイでダミー値の.envがある場合を模す)", () => {
    const result = findLocalEnvFiles("/project", (p: string) => p.endsWith("/.env"));
    expect(result).toEqual([".env"]);
  });

  it("複数の.env系ファイルが存在する場合、全て検出する", () => {
    const present = new Set(["/project/.env", "/project/.env.production.local"]);
    const result = findLocalEnvFiles("/project", (p: string) => present.has(p));
    expect(result).toEqual([".env", ".env.production.local"]);
  });

  it("Next.js本番読み込み順序(.env→.env.production→.env.local→.env.production.local)と候補一覧が一致する", () => {
    expect(ENV_FILE_CANDIDATES).toEqual([".env", ".env.production", ".env.local", ".env.production.local"]);
  });
});
