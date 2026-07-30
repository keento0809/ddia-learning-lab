import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ExerciseDefinitionSchema } from "@/lib/contracts/exercise";
import { gradeExercise } from "@/lib/runner/grader";
import * as solution from "./denormalize-users-lab.solution";

describe("denormalize-users-lab 模範解答", () => {
  it("graderで全テストにpassする", () => {
    const yamlPath = path.join(__dirname, "..", "denormalize-users-lab.yaml");
    const raw = parseYaml(fs.readFileSync(yamlPath, "utf-8"));
    const exercise = ExerciseDefinitionSchema.parse(raw);

    const summary = gradeExercise(exercise.tests, {
      resolveFn: (name) => (solution as Record<string, unknown>)[name],
    });

    if (summary.result !== "pass") {
      console.error(summary.perTest.filter((t) => !t.pass));
    }
    expect(summary.result).toBe("pass");
  });
});
