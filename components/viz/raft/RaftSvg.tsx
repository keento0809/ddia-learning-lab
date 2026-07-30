"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import { CLUSTER_SIZE, ELECTION_TIMEOUT_MAX, type RaftState } from "@/components/viz/raft/engine";

export interface RaftSvgViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export const RAFT_VIEW_BOX: RaftSvgViewBox = { minX: 0, minY: 0, width: 520, height: 300 };

const NODE_RADIUS = 30;
const NODE_Y = 150;
const NODE_X_START = 60;
const NODE_X_STEP = 100;

function nodeX(id: number): number {
  return NODE_X_START + id * NODE_X_STEP;
}

function dividerX(split: number): number {
  return 10 + split * NODE_X_STEP;
}

const ROLE_FILL: Record<string, string> = {
  leader: "fill-emerald-500 dark:fill-emerald-400",
  candidate: "fill-amber-500 dark:fill-amber-400",
  follower: "fill-sky-500 dark:fill-sky-400",
};
const STOPPED_FILL = "fill-neutral-400 dark:fill-neutral-600";

export interface RaftSvgProps {
  state: RaftState;
  locale: Locale;
  onToggleNode: (id: number) => void;
  onSetPartition: (split: number) => void;
}

/**
 * RaftVizのSVG本体(<g>群のみ)。外枠の<svg>(viewBox管理・レスポンシブ)は
 * 02§8.1のSvgStage(components/viz/core)をそのまま再利用するため、ここでは
 * SvgStageが描画するルート<svg>のchildrenとしてのみ使う。ポインタ操作の
 * 座標変換はイベントのcurrentTarget.ownerSVGElementから直接ルート<svg>の
 * getBoundingClientRectを取得することで、SvgStage側にref転送を追加せずに
 * 済ませている(T-203共通基盤への変更はスコープ外のため)。
 */
export function RaftSvg({ state, locale, onToggleNode, onSetPartition }: RaftSvgProps) {
  const t = getMessages(locale).raftViz;
  const [dragging, setDragging] = useState(false);

  function svgXToSplit(svg: SVGSVGElement, clientX: number): number {
    const rect = svg.getBoundingClientRect();
    const ratio = RAFT_VIEW_BOX.width / rect.width;
    const userX = RAFT_VIEW_BOX.minX + (clientX - rect.left) * ratio;
    const raw = Math.round((userX - 10) / NODE_X_STEP);
    return Math.max(0, Math.min(CLUSTER_SIZE, raw));
  }

  function handlePointerMove(event: PointerEvent<SVGGElement>) {
    if (!dragging) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    onSetPartition(svgXToSplit(svg, event.clientX));
  }

  function handlePointerUp(event: PointerEvent<SVGGElement>) {
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleDividerKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onSetPartition(Math.max(0, state.partitionSplit - 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onSetPartition(Math.min(CLUSTER_SIZE, state.partitionSplit + 1));
    }
  }

  function handleNodeKeyDown(event: KeyboardEvent<SVGGElement>, id: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggleNode(id);
    }
  }

  const isPartitioned = state.partitionSplit > 0 && state.partitionSplit < CLUSTER_SIZE;

  return (
    <>
      {isPartitioned ? (
        <line
          x1={dividerX(state.partitionSplit)}
          y1={20}
          x2={dividerX(state.partitionSplit)}
          y2={280}
          strokeDasharray="6 4"
          className="stroke-rose-500 dark:stroke-rose-400"
          strokeWidth={2}
        />
      ) : null}

      <g
        role="slider"
        tabIndex={0}
        aria-label={formatMessage(t.partition.dividerAriaLabel, { split: state.partitionSplit })}
        aria-valuemin={0}
        aria-valuemax={CLUSTER_SIZE}
        aria-valuenow={state.partitionSplit}
        data-testid="raft-partition-divider"
        className="cursor-ew-resize outline-none focus-visible:opacity-80"
        onPointerDown={(event) => {
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleDividerKeyDown}
      >
        <circle
          cx={dividerX(state.partitionSplit)}
          cy={20}
          r={8}
          className={isPartitioned ? "fill-rose-500 dark:fill-rose-400" : "fill-neutral-300 dark:fill-neutral-700"}
        />
      </g>

      {state.nodes.map((node) => {
        const x = nodeX(node.id);
        const roleLabel = node.alive ? t.roles[node.role] : t.roles.stopped;
        const fillClass = node.alive ? ROLE_FILL[node.role] : STOPPED_FILL;
        const timeoutRatio = Math.max(0, Math.min(1, node.electionTimeoutTicks / ELECTION_TIMEOUT_MAX));
        const circumference = 2 * Math.PI * (NODE_RADIUS + 6);

        return (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={formatMessage(t.node.toggleAriaLabel, {
              id: node.id + 1,
              role: roleLabel,
              term: node.currentTerm,
            })}
            data-testid={`raft-node-${node.id}`}
            data-role={node.alive ? node.role : "stopped"}
            className="cursor-pointer outline-none focus-visible:opacity-80"
            onClick={() => onToggleNode(node.id)}
            onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
          >
            {node.alive && node.role !== "leader" ? (
              <circle
                cx={x}
                cy={NODE_Y}
                r={NODE_RADIUS + 6}
                fill="none"
                strokeWidth={3}
                className="stroke-neutral-300 dark:stroke-neutral-700"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - timeoutRatio)}
                transform={`rotate(-90 ${x} ${NODE_Y})`}
              />
            ) : null}
            <circle cx={x} cy={NODE_Y} r={NODE_RADIUS} className={fillClass} />
            <text x={x} y={NODE_Y - 4} textAnchor="middle" className="fill-white text-[13px] font-semibold">
              {formatMessage(t.node.label, { id: node.id + 1 })}
            </text>
            <text x={x} y={NODE_Y + 12} textAnchor="middle" className="fill-white text-[10px]">
              {formatMessage(t.node.termLabel, { term: node.currentTerm })}
            </text>
            <text x={x} y={NODE_Y + NODE_RADIUS + 20} textAnchor="middle" className="fill-current text-[10px]">
              {formatMessage(t.node.commitIndexLabel, { index: node.commitIndex })}
            </text>
            <text x={x} y={NODE_Y + NODE_RADIUS + 34} textAnchor="middle" className="fill-current text-[10px]">
              {formatMessage(t.node.logLengthLabel, { length: node.log.length })}
            </text>
          </g>
        );
      })}
    </>
  );
}
