import type { ScenarioDefinition } from "./scenario/schema";
import scenarioData from "./generated/scenario-capstone.json";

/**
 * キャップストーン画面(T-302)向けの実行時ルックアップ。
 * lib/glossary.tsと同じ理由(node:fs非依存を保つ)で、ビルド時生成済みJSON
 * (scripts/generate-curriculum.tsのgenerateScenario)を通常のESM importとして
 * 取り込む。現時点でシナリオは1本(content/scenario-capstone.yaml)のみのため、
 * slug引数は取らずそのまま返す。
 */
export function getCapstoneScenario(): ScenarioDefinition {
  return scenarioData as ScenarioDefinition;
}
