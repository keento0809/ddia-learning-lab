"use client";

import { useEffect, useState, type DragEvent } from "react";
import type { VizComponentProps } from "@/components/viz/registry";
import { createSimEngine } from "@/components/viz/core/simEngine";
import { SvgStage } from "@/components/viz/core/SvgStage";
import { Timeline } from "@/components/viz/core/Timeline";
import { A11yNarrator } from "@/components/viz/core/A11yNarrator";
import { useLessonLocale } from "@/lib/lesson/localeContext";
import { getMessages } from "@/lib/i18n/messages";
import { isolationSimDefinition, isValidOrder, moveOperation } from "./engine";
import { isolationNarrator } from "./describeState";
import { PRESETS, PRESET_IDS } from "./presets";
import { ISOLATION_LEVELS } from "./types";
import type { IsolationLevel, IsolationState, PresetId, StepEvent, TxnId } from "./types";

/**
 * IsolationViz(Ch7, 02§8.2)。2トランザクションの操作タイムラインをドラッグ/
 * キーボードで並べ替え、分離レベル選択で結果(読める値/ブロック/アボート)が
 * どう変わるかを観察する可視化。components/viz/registry.tsから<Viz name="isolation">
 * 経由で遅延ロードされる(components/mdx/Viz.tsx参照)。
 */

function normalizePreset(preset: string | undefined): PresetId {
  return preset && (PRESET_IDS as readonly string[]).includes(preset) ? (preset as PresetId) : "dirty-read";
}

function chipStatus(
  opId: string,
  operationKind: "read" | "write" | "commit",
  state: IsolationState,
): "pending" | "blocked" | "done" | "aborted" {
  if (opId === state.blockedOpId) return "blocked";
  if (!state.completed.includes(opId)) return "pending";
  if (operationKind === "commit") {
    const event = state.eventLog.find((candidate) => candidate.opId === opId);
    if (event?.outcomeKind === "commit-aborted") return "aborted";
  }
  return "done";
}

function TxnBadge({ txn }: { txn: TxnId }) {
  return (
    <span
      data-testid="isolation-chip-txn"
      className={
        txn === "T1"
          ? "rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-100"
          : "rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-100"
      }
    >
      {txn}
    </span>
  );
}

export function IsolationViz({ preset }: VizComponentProps) {
  const locale = useLessonLocale();
  const t = getMessages(locale).isolationViz;

  const [engine] = useState(() => {
    const created = createSimEngine(isolationSimDefinition, { seed: 1 });
    const initialPresetId = normalizePreset(preset);
    if (initialPresetId !== created.getState().presetId) {
      created.dispatch({ type: "select-preset", presetId: initialPresetId });
    }
    return created;
  });
  const [state, setState] = useState<IsolationState>(() => engine.getState());

  useEffect(() => engine.subscribe(setState), [engine]);

  const presetDefinition = PRESETS[state.presetId];
  const canReorder = state.completed.length === 0;

  function eventFor(opId: string): StepEvent | undefined {
    return state.eventLog.find((candidate) => candidate.opId === opId);
  }

  function canMove(index: number, targetIndex: number): boolean {
    if (!canReorder) return false;
    if (targetIndex < 0 || targetIndex >= state.order.length) return false;
    const candidate = moveOperation(state.order, index, targetIndex);
    return isValidOrder(state.operations, candidate);
  }

  function move(index: number, targetIndex: number): void {
    engine.dispatch({ type: "reorder", fromIndex: index, toIndex: targetIndex });
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, index: number): void {
    if (!canReorder) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", String(index));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetIndex: number): void {
    event.preventDefault();
    if (!canReorder) return;
    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
    if (Number.isNaN(fromIndex)) return;
    move(fromIndex, targetIndex);
  }

  return (
    <div data-testid="isolation-viz" className="my-4 rounded border border-neutral-300 p-4 dark:border-neutral-700">
      <h3 className="text-lg font-semibold">{t.heading}</h3>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex flex-col text-sm">
          <span>{t.presetLabel}</span>
          <select
            aria-label={t.presetSelectAriaLabel}
            data-testid="isolation-preset-select"
            value={state.presetId}
            onChange={(event) =>
              engine.dispatch({ type: "select-preset", presetId: event.target.value as PresetId })
            }
          >
            {PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {PRESETS[id].title[locale]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-sm">
          <span>{t.levelLabel}</span>
          <select
            aria-label={t.levelSelectAriaLabel}
            data-testid="isolation-level-select"
            value={state.isolationLevel}
            onChange={(event) =>
              engine.dispatch({ type: "select-level", level: event.target.value as IsolationLevel })
            }
          >
            {ISOLATION_LEVELS.map((level) => (
              <option key={level} value={level}>
                {t.levelNames[level]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{presetDefinition.description[locale]}</p>

      <SvgStage
        viewBox={{ minX: 0, minY: 0, width: 400, height: 140 }}
        ariaLabel={t.stageAriaLabel}
        className="mt-3 h-auto w-full max-w-md"
      >
        {(["T1", "T2"] as const).map((txn, row) => (
          <g key={txn} transform={`translate(10, ${10 + row * 60})`}>
            <rect width={180} height={48} rx={6} fill="none" stroke="currentColor" />
            <text x={8} y={18} fontSize={12} fill="currentColor">
              {txn}
            </text>
            <text x={8} y={34} fontSize={11} fill="currentColor">
              {t.txnStatus[state.txns[txn].status]}
            </text>
          </g>
        ))}
        <g transform="translate(210, 10)">
          <text x={0} y={0} fontSize={12} fill="currentColor">
            {t.storeHeading}
          </text>
          {Object.entries(state.store).map(([key, value], index) => (
            <text key={key} x={0} y={20 + index * 16} fontSize={11} fill="currentColor">
              {`${key} = ${value}`}
            </text>
          ))}
        </g>
      </SvgStage>

      <h4 className="mt-4 font-semibold">{t.timelineHeading}</h4>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.reorderHint}</p>

      <div role="list" data-testid="isolation-timeline" className="mt-2 flex flex-wrap gap-2">
        {state.order.map((opId, index) => {
          const operation = state.operations.find((candidate) => candidate.id === opId)!;
          const status = chipStatus(opId, operation.kind, state);
          const event = eventFor(opId);

          return (
            <div
              key={opId}
              role="listitem"
              data-testid={`isolation-chip-${opId}`}
              data-status={status}
              draggable={canReorder}
              onDragStart={(dragEvent) => handleDragStart(dragEvent, index)}
              onDragOver={(dragEvent) => dragEvent.preventDefault()}
              onDrop={(dragEvent) => handleDrop(dragEvent, index)}
              className={
                "flex items-center gap-1 rounded border px-2 py-1 text-xs " +
                (status === "blocked"
                  ? "border-red-500 bg-red-50 dark:bg-red-950"
                  : status === "aborted"
                    ? "border-red-700 bg-red-100 line-through dark:bg-red-900"
                    : status === "done"
                      ? "border-green-600 bg-green-50 dark:bg-green-950"
                      : "border-neutral-300 dark:border-neutral-700")
              }
            >
              <button
                type="button"
                aria-label={t.moveEarlierLabel}
                data-testid={`isolation-move-earlier-${opId}`}
                disabled={!canMove(index, index - 1)}
                onClick={() => move(index, index - 1)}
              >
                {t.moveEarlierGlyph}
              </button>
              <TxnBadge txn={operation.txn} />
              <span>{operation.label[locale]}</span>
              <span data-testid="isolation-chip-status">{t.chipStatus[status]}</span>
              {event && event.outcomeKind === "read" && (
                <span data-testid="isolation-chip-outcome">
                  {`${event.key} = ${event.value}`}
                  {event.dirty ? ` (${t.dirtyReadTag})` : ""}
                </span>
              )}
              {event && event.outcomeKind === "write-applied" && (
                <span data-testid="isolation-chip-outcome">{`${event.key} = ${event.value}`}</span>
              )}
              <button
                type="button"
                aria-label={t.moveLaterLabel}
                data-testid={`isolation-move-later-${opId}`}
                disabled={!canMove(index, index + 1)}
                onClick={() => move(index, index + 1)}
              >
                {t.moveLaterGlyph}
              </button>
            </div>
          );
        })}
      </div>

      <Timeline
        locale={locale}
        onStep={() => engine.step()}
        onReset={() => engine.dispatch({ type: "select-level", level: state.isolationLevel })}
      />

      <A11yNarrator state={state} locale={locale} narratable={isolationNarrator} />
    </div>
  );
}
