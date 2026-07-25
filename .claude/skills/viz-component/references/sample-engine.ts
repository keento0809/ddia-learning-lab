/**
 * viz-componentスキルのサンプル: 架空の「ジョブキュー」Viz(容量5のFIFO)。
 * SimEngineDefinitionの3関数(createInitialState/applyAction/advance)と、
 * 決定的乱数注入(rng)の使い方だけを示すための最小構成であり、実在のVizではない。
 * 本物の実装例はcomponents/viz/{lsm-tree,hashRingEngine.ts,...}を参照すること。
 *
 * 配置場所の例: components/viz/job-queue/engine.ts
 */
import { createSimEngine, type SimEngineDefinition } from "@/components/viz/core/simEngine";
import type { SimEngine } from "@/lib/contracts";

export interface JobQueueItem {
  id: number;
  label: string;
}

/** 判別可能なイベント型。noopも「何が起きなかったか」を明示する(nullで握りつぶさない)。 */
export type JobQueueEvent =
  | { kind: "enqueue"; id: number }
  | { kind: "dequeue"; id: number }
  | { kind: "dropped"; id: number }
  | { kind: "noop"; reason: "empty" | "full" };

export interface JobQueueState {
  items: JobQueueItem[];
  capacity: number;
  nextId: number;
  lastEvent: JobQueueEvent | null;
}

export type JobQueueAction = { type: "enqueue" } | { type: "dequeue" };

const CAPACITY = 5;
/** step()で自律到着を試みる確率。乱数はrng()経由でのみ消費する(Math.random()禁止)。 */
const ARRIVAL_PROBABILITY = 0.3;

function createInitialJobQueueState(): JobQueueState {
  return { items: [], capacity: CAPACITY, nextId: 1, lastEvent: null };
}

function enqueue(state: JobQueueState): JobQueueState {
  if (state.items.length >= state.capacity) {
    return { ...state, lastEvent: { kind: "noop", reason: "full" } };
  }
  const item: JobQueueItem = { id: state.nextId, label: `job-${state.nextId}` };
  return {
    ...state,
    items: [...state.items, item],
    nextId: state.nextId + 1,
    lastEvent: { kind: "enqueue", id: item.id },
  };
}

function dequeue(state: JobQueueState): JobQueueState {
  const [head, ...rest] = state.items;
  if (!head) {
    return { ...state, lastEvent: { kind: "noop", reason: "empty" } };
  }
  return { ...state, items: rest, lastEvent: { kind: "dequeue", id: head.id } };
}

/** 満杯時の自律到着は「先頭ドロップ」として扱う(実運用のバックプレッシャーの単純化)。 */
function dropOldest(state: JobQueueState): JobQueueState {
  const [dropped, ...rest] = state.items;
  if (!dropped) return { ...state, lastEvent: { kind: "noop", reason: "empty" } };
  return { ...state, items: rest, lastEvent: { kind: "dropped", id: dropped.id } };
}

const jobQueueDefinition: SimEngineDefinition<JobQueueState, JobQueueAction> = {
  createInitialState: () => createInitialJobQueueState(),
  applyAction: (state, action) => {
    if (action.type === "enqueue") return enqueue(state);
    return dequeue(state);
  },
  // step()は「自律的な時間経過」の例。到着確率をrngで判定するため、
  // 同一シードで同一系列のenqueue/dropped/noopが再現される(決定性テストの対象)。
  advance: (state, rng) => {
    if (rng() > ARRIVAL_PROBABILITY) return { ...state, lastEvent: null };
    if (state.items.length < state.capacity) return enqueue(state);
    return dropOldest(state);
  },
};

export function createJobQueueEngine(seed?: number): SimEngine<JobQueueState, JobQueueAction> {
  return createSimEngine(jobQueueDefinition, { seed });
}
