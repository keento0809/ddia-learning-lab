import type { A11yNarratable, SimEngine } from "@/lib/contracts";
import type { SimEngineDefinition } from "@/components/viz/core/simEngine";
import { createSimEngine } from "@/components/viz/core/simEngine";
import { formatMessage, getMessages } from "@/lib/i18n/messages";

/**
 * HashRingViz(Ch6)のSimEngineロジック。参照設計: 02§8.2「HashRingViz」
 * 状態: `{ nodes: {id, vnodes[]}[], keys: Key[] }`、リング上の角度配置。
 * 操作: ノード追加/削除、vnodes数スライダー(1–300)、キー1000個一括投入。
 * 指標: ノードあたりキー数の標準偏差、直近操作での移動キー率。
 *
 * ノード/キーの円環上の位置は決定的ハッシュ(FNV-1a 32bit)から算出する。
 * 乱数(createSimEngine注入のrng)は使わない — 位置決定に乱数を用いると
 * 「vnodes増で標準偏差が単調減少傾向」「移動率が理論値±15%」という統計的な
 * 受入基準の再現性が損なわれるため、キーIDも連番("key-0","key-1",…)で
 * 決定的に生成する。
 */

const RING_SPACE = 0x100000000; // 2^32

export const MIN_VNODES = 1;
export const MAX_VNODES = 300;
export const BULK_KEY_COUNT = 1000;
export const INITIAL_VNODES_PER_NODE = 50;

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function angleOf(hash: number): number {
  return (hash / RING_SPACE) * 360;
}

export interface HashRingVNode {
  hash: number;
  angle: number;
}

export interface HashRingNodeState {
  id: string;
  vnodes: HashRingVNode[];
}

export interface HashRingKey {
  id: string;
  hash: number;
  angle: number;
  ownerNodeId: string | null;
}

export type HashRingOperationType = "init" | "addNode" | "removeNode" | "setVnodes" | "addKeys";

export interface HashRingLastOperation {
  type: HashRingOperationType;
  targetId: string | null;
  movedCount: number;
  movedRatio: number;
  addedCount: number;
}

export interface HashRingState {
  nodes: HashRingNodeState[];
  keys: HashRingKey[];
  vnodesPerNode: number;
  nextNodeSeq: number;
  nextKeySeq: number;
  lastOperation: HashRingLastOperation;
}

export type HashRingAction =
  | { type: "addNode" }
  | { type: "removeNode"; id: string }
  | { type: "setVnodes"; count: number }
  | { type: "addKeys"; count: number };

function clampVnodes(count: number): number {
  return Math.min(MAX_VNODES, Math.max(MIN_VNODES, Math.round(count)));
}

function computeVnodes(nodeId: string, count: number): HashRingVNode[] {
  const vnodes: HashRingVNode[] = [];
  for (let i = 0; i < count; i++) {
    const hash = fnv1a32(`${nodeId}::vnode::${i}`);
    vnodes.push({ hash, angle: angleOf(hash) });
  }
  return vnodes;
}

interface RingPoint {
  hash: number;
  nodeId: string;
}

function buildRing(nodes: HashRingNodeState[]): RingPoint[] {
  const points: RingPoint[] = [];
  for (const node of nodes) {
    for (const vnode of node.vnodes) {
      points.push({ hash: vnode.hash, nodeId: node.id });
    }
  }
  points.sort((a, b) => a.hash - b.hash);
  return points;
}

/** キーのハッシュ値から時計回りに最も近いvnodeが属するノードを返す(コンシステントハッシュの基本則) */
function ownerOf(hash: number, ring: RingPoint[]): string | null {
  if (ring.length === 0) return null;
  let lo = 0;
  let hi = ring.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ring[mid].hash < hash) lo = mid + 1;
    else hi = mid;
  }
  return ring[lo === ring.length ? 0 : lo].nodeId;
}

function reassignKeys(
  keys: HashRingKey[],
  nodes: HashRingNodeState[],
): { keys: HashRingKey[]; movedCount: number } {
  const ring = buildRing(nodes);
  let movedCount = 0;
  const nextKeys = keys.map((key) => {
    const owner = ownerOf(key.hash, ring);
    if (owner !== key.ownerNodeId) {
      movedCount += 1;
      return { ...key, ownerNodeId: owner };
    }
    return key;
  });
  return { keys: nextKeys, movedCount };
}

function withReassignment(
  state: HashRingState,
  nodes: HashRingNodeState[],
  operation: Omit<HashRingLastOperation, "movedCount" | "movedRatio">,
): HashRingState {
  const { keys, movedCount } = reassignKeys(state.keys, nodes);
  const movedRatio = keys.length === 0 ? 0 : movedCount / keys.length;
  return {
    ...state,
    nodes,
    keys,
    lastOperation: { ...operation, movedCount, movedRatio },
  };
}

function createInitialLastOperation(): HashRingLastOperation {
  return { type: "init", targetId: null, movedCount: 0, movedRatio: 0, addedCount: 0 };
}

export const hashRingDefinition: SimEngineDefinition<HashRingState, HashRingAction> = {
  createInitialState(): HashRingState {
    return {
      nodes: [],
      keys: [],
      vnodesPerNode: INITIAL_VNODES_PER_NODE,
      nextNodeSeq: 1,
      nextKeySeq: 0,
      lastOperation: createInitialLastOperation(),
    };
  },

  applyAction(state, action): HashRingState {
    switch (action.type) {
      case "addNode": {
        const id = `node-${state.nextNodeSeq}`;
        const newNode: HashRingNodeState = { id, vnodes: computeVnodes(id, state.vnodesPerNode) };
        const nodes = [...state.nodes, newNode];
        return {
          ...withReassignment(state, nodes, { type: "addNode", targetId: id, addedCount: 0 }),
          nextNodeSeq: state.nextNodeSeq + 1,
        };
      }
      case "removeNode": {
        if (!state.nodes.some((node) => node.id === action.id)) return state;
        const nodes = state.nodes.filter((node) => node.id !== action.id);
        return withReassignment(state, nodes, {
          type: "removeNode",
          targetId: action.id,
          addedCount: 0,
        });
      }
      case "setVnodes": {
        const vnodesPerNode = clampVnodes(action.count);
        const nodes = state.nodes.map((node) => ({
          id: node.id,
          vnodes: computeVnodes(node.id, vnodesPerNode),
        }));
        return {
          ...withReassignment(state, nodes, { type: "setVnodes", targetId: null, addedCount: 0 }),
          vnodesPerNode,
        };
      }
      case "addKeys": {
        const ring = buildRing(state.nodes);
        const newKeys: HashRingKey[] = [];
        let nextKeySeq = state.nextKeySeq;
        for (let i = 0; i < action.count; i++) {
          const id = `key-${nextKeySeq}`;
          nextKeySeq += 1;
          const hash = fnv1a32(id);
          newKeys.push({ id, hash, angle: angleOf(hash), ownerNodeId: ownerOf(hash, ring) });
        }
        return {
          ...state,
          keys: [...state.keys, ...newKeys],
          nextKeySeq,
          lastOperation: {
            type: "addKeys",
            targetId: null,
            movedCount: 0,
            movedRatio: 0,
            addedCount: newKeys.length,
          },
        };
      }
      default:
        return state;
    }
  },

  // HashRingVizはノード追加/削除・vnodes変更・キー投入という離散操作のみで
  // 構成され、時間経過によるアニメーション状態を持たないためadvance()は無変化。
  advance(state): HashRingState {
    return state;
  },
};

export function createHashRingEngine(seed?: number): SimEngine<HashRingState, HashRingAction> {
  return createSimEngine(hashRingDefinition, seed === undefined ? {} : { seed });
}

export function computeKeyCountsPerNode(state: HashRingState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of state.nodes) counts.set(node.id, 0);
  for (const key of state.keys) {
    if (key.ownerNodeId && counts.has(key.ownerNodeId)) {
      counts.set(key.ownerNodeId, (counts.get(key.ownerNodeId) ?? 0) + 1);
    }
  }
  return counts;
}

/** ノードあたりキー数の標準偏差(母集団標準偏差)。02§8.2 指標パネル */
export function computeKeyCountStdDev(state: HashRingState): number {
  if (state.nodes.length === 0) return 0;
  const counts = [...computeKeyCountsPerNode(state).values()];
  const mean = counts.reduce((sum, value) => sum + value, 0) / counts.length;
  const variance = counts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / counts.length;
  return Math.sqrt(variance);
}

export const hashRingNarratable: A11yNarratable<HashRingState> = {
  describeState(state, locale) {
    const t = getMessages(locale).hashRingViz.narrator;
    const stdDev = computeKeyCountStdDev(state);
    return formatMessage(t.summary, {
      nodeCount: state.nodes.length,
      keyCount: state.keys.length,
      vnodesPerNode: state.vnodesPerNode,
      operation: t.operationLabels[state.lastOperation.type],
      movedRatio: (state.lastOperation.movedRatio * 100).toFixed(1),
      stdDev: stdDev.toFixed(2),
    });
  },
};
