"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { useLessonLocale } from "@/lib/lesson/localeContext";
import { SvgStage } from "@/components/viz/core/SvgStage";
import { A11yNarrator } from "@/components/viz/core/A11yNarrator";
import {
  BULK_KEY_COUNT,
  MAX_VNODES,
  MIN_VNODES,
  computeKeyCountStdDev,
  createHashRingEngine,
  hashRingNarratable,
  type HashRingState,
} from "@/components/viz/hashRingEngine";

const RING_RADIUS = 100;
const KEY_RING_RADIUS = RING_RADIUS * 0.75;
const VNODE_TICK_RADIUS = 3;
const KEY_DOT_RADIUS = 2;
const VIEW_BOX = { minX: -130, minY: -130, width: 260, height: 260 };
const UNOWNED_KEY_COLOR = "#9ca3af";

function polarToPoint(angleDeg: number, radius: number): { x: number; y: number } {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return { x: radius * Math.cos(radians), y: radius * Math.sin(radians) };
}

/** 黄金角(≈137.508°)でノードごとに色相をずらし、隣接ノードの色が近くなりにくくする */
function nodeColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

/**
 * HashRingViz(Ch6, 02§8.2)。コンシステントハッシュのリングを描画し、
 * ノード追加/削除・vnodes数変更・キー一括投入の操作と、ノードあたりキー数の
 * 標準偏差・直近操作の移動キー率を指標パネルに表示する。
 * ロジックは components/viz/hashRingEngine.ts の SimEngine に委譲する。
 */
export function HashRingViz() {
  const locale = useLessonLocale();
  const t = getMessages(locale).hashRingViz;
  const [engine] = useState(() => createHashRingEngine());
  const [state, setState] = useState<HashRingState>(() => engine.getState());
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const selectId = useId();
  const vnodesId = useId();
  const statsHeadingId = useId();

  useEffect(() => engine.subscribe(setState), [engine]);

  useEffect(() => {
    if (state.nodes.length === 0) {
      if (selectedNodeId !== "") setSelectedNodeId("");
      return;
    }
    if (!state.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(state.nodes[0].id);
    }
  }, [state.nodes, selectedNodeId]);

  const nodeIndex = useMemo(() => {
    const map = new Map<string, number>();
    state.nodes.forEach((node, index) => map.set(node.id, index));
    return map;
  }, [state.nodes]);

  const stdDev = computeKeyCountStdDev(state);

  return (
    <div data-testid="hash-ring-viz" className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t.heading}</h2>

      <SvgStage
        viewBox={VIEW_BOX}
        ariaLabel={t.ringAriaLabel}
        className="mx-auto h-auto w-full max-w-md"
      >
        <circle
          cx={0}
          cy={0}
          r={RING_RADIUS}
          fill="none"
          className="stroke-neutral-300 dark:stroke-neutral-700"
          strokeWidth={1}
        />
        {state.nodes.map((node) => {
          const color = nodeColor(nodeIndex.get(node.id) ?? 0);
          return (
            <g key={node.id} data-testid="hash-ring-node-group">
              {node.vnodes.map((vnode, vIndex) => {
                const point = polarToPoint(vnode.angle, RING_RADIUS);
                return (
                  <circle
                    key={`${node.id}-${vIndex}`}
                    cx={point.x}
                    cy={point.y}
                    r={VNODE_TICK_RADIUS}
                    fill={color}
                  />
                );
              })}
            </g>
          );
        })}
        {state.keys.map((key) => {
          const point = polarToPoint(key.angle, KEY_RING_RADIUS);
          const ownerIndex = key.ownerNodeId ? nodeIndex.get(key.ownerNodeId) : undefined;
          const color = ownerIndex === undefined ? UNOWNED_KEY_COLOR : nodeColor(ownerIndex);
          return (
            <circle
              key={key.id}
              cx={point.x}
              cy={point.y}
              r={KEY_DOT_RADIUS}
              fill={color}
              opacity={0.7}
            />
          );
        })}
      </SvgStage>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          data-testid="hash-ring-add-node"
          onClick={() => engine.dispatch({ type: "addNode" })}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          {t.controls.addNodeButton}
        </button>

        <div className="flex items-end gap-2">
          <label htmlFor={selectId} className="flex flex-col text-sm">
            {t.controls.removeNodeLabel}
            <select
              id={selectId}
              data-testid="hash-ring-remove-node-select"
              value={selectedNodeId}
              onChange={(event) => setSelectedNodeId(event.target.value)}
              disabled={state.nodes.length === 0}
              className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
            >
              {state.nodes.length === 0 ? (
                <option value="">{t.controls.removeNodeEmptyOption}</option>
              ) : (
                state.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.id}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="button"
            data-testid="hash-ring-remove-node"
            disabled={state.nodes.length === 0}
            onClick={() => {
              if (selectedNodeId) engine.dispatch({ type: "removeNode", id: selectedNodeId });
            }}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
          >
            {t.controls.removeNodeButton}
          </button>
        </div>

        <label htmlFor={vnodesId} className="flex flex-col text-sm">
          {formatMessage(t.controls.vnodesSliderLabel, { count: state.vnodesPerNode })}
          <input
            id={vnodesId}
            type="range"
            data-testid="hash-ring-vnodes-slider"
            aria-label={t.controls.vnodesSliderAriaLabel}
            min={MIN_VNODES}
            max={MAX_VNODES}
            value={state.vnodesPerNode}
            onChange={(event) =>
              engine.dispatch({ type: "setVnodes", count: Number(event.target.value) })
            }
          />
        </label>

        <button
          type="button"
          data-testid="hash-ring-add-keys"
          onClick={() => engine.dispatch({ type: "addKeys", count: BULK_KEY_COUNT })}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
        >
          {formatMessage(t.controls.addKeysButton, { count: BULK_KEY_COUNT })}
        </button>
      </div>

      <section aria-labelledby={statsHeadingId} data-testid="hash-ring-stats" className="text-sm">
        <h3 id={statsHeadingId} className="font-semibold">
          {t.stats.heading}
        </h3>
        {state.nodes.length === 0 ? (
          <p data-testid="hash-ring-no-nodes-note">{t.stats.noNodesNote}</p>
        ) : (
          <ul className="space-y-1">
            <li data-testid="hash-ring-stat-node-count">
              {formatMessage(t.stats.nodeCountLabel, { count: state.nodes.length })}
            </li>
            <li data-testid="hash-ring-stat-key-count">
              {formatMessage(t.stats.keyCountLabel, { count: state.keys.length })}
            </li>
            <li data-testid="hash-ring-stat-stddev">
              {formatMessage(t.stats.stdDevLabel, { value: stdDev.toFixed(2) })}
            </li>
            <li data-testid="hash-ring-stat-moved-ratio">
              {formatMessage(t.stats.movedRatioLabel, {
                value: (state.lastOperation.movedRatio * 100).toFixed(1),
              })}
            </li>
          </ul>
        )}
      </section>

      <A11yNarrator state={state} locale={locale} narratable={hashRingNarratable} />
    </div>
  );
}
