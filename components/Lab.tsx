"use client";

import { useState } from "react";
import { runExercise } from "@/lib/runner/jsRunner";
import {
  ENTRY,
  INFINITE_LOOP_CODE,
  SOLUTION_CODE,
  TEMPLATE_CODE,
  TESTS,
  TIMEOUT_MS,
} from "@/lib/runner/exerciseFixture";
import type { RunResult } from "@/lib/runner/types";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";

export function Lab({ locale }: { locale: Locale }) {
  const t = getMessages(locale).lab;
  const [code, setCode] = useState(TEMPLATE_CODE[locale]);
  const [status, setStatus] = useState<"idle" | "running">("idle");
  const [result, setResult] = useState<RunResult | null>(null);

  async function handleRun() {
    setStatus("running");
    setResult(null);
    const runResult = await runExercise({
      code,
      entry: ENTRY,
      tests: TESTS,
      timeoutMs: TIMEOUT_MS,
    });
    setResult(runResult);
    setStatus("idle");
  }

  return (
    <div style={{ border: "1px solid #ccc", padding: "1rem", marginTop: "1rem" }}>
      <div style={{ marginBottom: "0.5rem" }}>
        <button type="button" onClick={() => setCode(SOLUTION_CODE)}>
          {t.loadSolution}
        </button>{" "}
        <button type="button" onClick={() => setCode(INFINITE_LOOP_CODE)}>
          {t.loadInfiniteLoop}
        </button>
      </div>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        rows={8}
        style={{ width: "100%", fontFamily: "monospace" }}
        data-testid="lab-code-editor"
      />

      <div style={{ marginTop: "0.5rem" }}>
        <button type="button" onClick={handleRun} disabled={status === "running"}>
          {status === "running" ? t.running : t.run}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: "1rem" }} data-testid="lab-result">
          <ResultSummary result={result} t={t} />
        </div>
      )}
    </div>
  );
}

function ResultSummary({
  result,
  t,
}: {
  result: RunResult;
  t: ReturnType<typeof getMessages>["lab"];
}) {
  if (result.result === "timeout") {
    return (
      <p data-testid="lab-result-status">
        {t.resultTimeout} ({formatMessage(t.durationLabel, { ms: result.durationMs })})
      </p>
    );
  }

  if (result.result === "error") {
    return (
      <p data-testid="lab-result-status">
        {t.resultError}: {result.error}
      </p>
    );
  }

  const passed = result.perTest.filter((test) => test.pass).length;
  return (
    <div data-testid="lab-result-status">
      <p>{result.result === "pass" ? t.resultPass : t.resultFail}</p>
      <p>{formatMessage(t.testsPassed, { passed, total: result.perTest.length })}</p>
      <p>{formatMessage(t.durationLabel, { ms: result.durationMs })}</p>
      <ul>
        {result.perTest.map((test) => (
          <li key={test.id}>
            {test.id}: {test.pass ? "OK" : `NG (${test.error ?? test.actual})`}
          </li>
        ))}
      </ul>
    </div>
  );
}
