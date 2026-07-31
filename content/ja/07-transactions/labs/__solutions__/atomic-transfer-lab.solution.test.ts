import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import initSqlJs from "sql.js";
import { ExerciseDefinitionSchema } from "@/lib/contracts/exercise";
import { buildSqlRunRequest } from "@/lib/lab/buildSqlRunRequest";
import { runSqlHarness } from "@/lib/runner/sqlHarness.worker";
import { SOLUTION_SQL } from "./atomic-transfer-lab.solution";

/**
 * sql.jsはNode上でも(パッケージ既定のfs解決で)そのまま動作するため、モックせず
 * 実sql.jsに対して実行する(CLAUDE.md規則3、tests/unit/runner/sqlHarness.test.ts
 * と同じdeps注入パターン)。
 */
describe("atomic-transfer-lab 模範解答", () => {
  it("SQLハーネスで全テストにpassする", async () => {
    const yamlPath = path.join(__dirname, "..", "atomic-transfer-lab.yaml");
    const raw = parseYaml(fs.readFileSync(yamlPath, "utf-8"));
    const exercise = ExerciseDefinitionSchema.parse(raw);

    const request = buildSqlRunRequest(exercise, SOLUTION_SQL);
    const result = await runSqlHarness(request, { loadSqlJs: () => initSqlJs() });

    if (result.result !== "pass") {
      console.error(result);
    }
    expect(result.result).toBe("pass");
  });
});
