import type { A11yNarratable, SimEngine } from "@/lib/contracts";
import type { Locale } from "@/lib/contracts/common";
import { createSimEngine, type SimEngineDefinition } from "@/components/viz/core/simEngine";
import type { RandomSource } from "@/components/viz/core/rng";
import { formatMessage, getMessages } from "@/lib/i18n/messages";

/**
 * RaftViz(02§8.2)のSimEngine実装。5ノードのRaft選出安全性
 * (同一termに2リーダー不成立)と、パーティション時の少数側コミット不能を
 * 単体テストで担保できるよう、実Raftの本質(投票は1term1票・コミットは
 * 全クラスタ数基準のクォーラム)のみを残した簡略状態機械として実装する。
 */

export const CLUSTER_SIZE = 5;
export const QUORUM = 3;
export const ELECTION_TIMEOUT_MIN = 3;
export const ELECTION_TIMEOUT_MAX = 6;

export type RaftRole = "follower" | "candidate" | "leader";

export interface RaftLogEntry {
  term: number;
  value: string;
}

export interface RaftNode {
  id: number;
  alive: boolean;
  role: RaftRole;
  currentTerm: number;
  votedFor: number | null;
  log: RaftLogEntry[];
  commitIndex: number;
  electionTimeoutTicks: number;
  /** リーダーである間のみ意味を持つ。到達不能な追従者の値は最後に到達した時点で凍結される */
  matchIndex: Record<number, number>;
}

export interface RaftState {
  nodes: RaftNode[];
  /** 分断線の位置(0〜CLUSTER_SIZE)。0またはCLUSTER_SIZEは分断なしを表す */
  partitionSplit: number;
  tick: number;
  quizMode: boolean;
  quizResult: "correct" | "incorrect" | null;
}

export type RaftAction =
  | { type: "toggleNode"; id: number }
  | { type: "setPartition"; split: number }
  | { type: "propose" }
  | { type: "toggleQuizMode" }
  | { type: "submitQuizAnswer" };

function randomTimeout(rng: RandomSource): number {
  const span = ELECTION_TIMEOUT_MAX - ELECTION_TIMEOUT_MIN + 1;
  return ELECTION_TIMEOUT_MIN + Math.floor(rng() * span);
}

function partitionGroup(split: number, id: number): number {
  if (split <= 0 || split >= CLUSTER_SIZE) return 0;
  return id < split ? 0 : 1;
}

function canReach(state: RaftState, a: RaftNode, b: RaftNode): boolean {
  return (
    a.alive && b.alive && partitionGroup(state.partitionSplit, a.id) === partitionGroup(state.partitionSplit, b.id)
  );
}

function createInitialState(rng: RandomSource): RaftState {
  const nodes: RaftNode[] = Array.from({ length: CLUSTER_SIZE }, (_, id) => ({
    id,
    alive: true,
    role: "follower",
    currentTerm: 0,
    votedFor: null,
    log: [],
    commitIndex: 0,
    electionTimeoutTicks: randomTimeout(rng),
    matchIndex: {},
  }));
  return { nodes, partitionSplit: 0, tick: 0, quizMode: false, quizResult: null };
}

function applyAction(state: RaftState, action: RaftAction, rng: RandomSource): RaftState {
  switch (action.type) {
    case "toggleNode": {
      const nodes = state.nodes.map((node) => {
        if (node.id !== action.id) return node;
        const alive = !node.alive;
        return alive
          ? { ...node, alive, role: "follower" as const, electionTimeoutTicks: randomTimeout(rng) }
          : { ...node, alive };
      });
      return { ...state, nodes };
    }
    case "setPartition": {
      const split = Math.max(0, Math.min(CLUSTER_SIZE, action.split));
      return { ...state, partitionSplit: split };
    }
    case "propose": {
      const leader = state.nodes.find((node) => node.alive && node.role === "leader");
      if (!leader) return state;
      const nodes = state.nodes.map((node) =>
        node.id === leader.id
          ? { ...node, log: [...node.log, { term: node.currentTerm, value: `w${node.log.length + 1}` }] }
          : node,
      );
      return { ...state, nodes };
    }
    case "toggleQuizMode": {
      return { ...state, quizMode: !state.quizMode, quizResult: null };
    }
    case "submitQuizAnswer": {
      if (!state.quizMode) return state;
      const aliveCount = state.nodes.filter((node) => node.alive).length;
      return { ...state, quizResult: aliveCount === QUORUM ? "correct" : "incorrect" };
    }
    default:
      return state;
  }
}

function advance(state: RaftState, rng: RandomSource): RaftState {
  const nodes = state.nodes.map((node) => ({
    ...node,
    log: node.log,
    matchIndex: { ...node.matchIndex },
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const nextState: RaftState = { ...state, tick: state.tick + 1, nodes };
  const reachedThisTick = new Set<number>();

  // 1. リーダーからのハートビート/複製/コミット判定
  for (const leader of nodes) {
    if (!leader.alive || leader.role !== "leader") continue;
    for (const follower of nodes) {
      if (follower.id === leader.id || !canReach(nextState, leader, follower)) continue;
      if (follower.currentTerm > leader.currentTerm) {
        leader.role = "follower";
        leader.currentTerm = follower.currentTerm;
        leader.votedFor = null;
        break;
      }
      follower.currentTerm = leader.currentTerm;
      follower.role = "follower";
      follower.votedFor = leader.id;
      if (follower.log.length < leader.log.length) {
        follower.log = leader.log.slice();
      }
      follower.electionTimeoutTicks = randomTimeout(rng);
      leader.matchIndex[follower.id] = follower.log.length;
      reachedThisTick.add(follower.id);
    }
    if (leader.role !== "leader") continue;
    leader.matchIndex[leader.id] = leader.log.length;
    reachedThisTick.add(leader.id);
    for (let index = leader.log.length; index > leader.commitIndex; index--) {
      const acked = nodes.filter((node) => (leader.matchIndex[node.id] ?? 0) >= index).length;
      if (acked >= QUORUM && leader.log[index - 1]?.term === leader.currentTerm) {
        leader.commitIndex = index;
        break;
      }
    }
  }

  // 2. リーダー以外のタイムアウト減算(このtickでハートビートを受けたノードは除く)
  for (const node of nodes) {
    if (!node.alive || node.role === "leader" || reachedThisTick.has(node.id)) continue;
    node.electionTimeoutTicks -= 1;
    if (node.electionTimeoutTicks <= 0) {
      node.role = "candidate";
      node.currentTerm += 1;
      node.votedFor = node.id;
      node.electionTimeoutTicks = randomTimeout(rng);
    }
  }

  // 3. 立候補中ノードの投票集計(同一term・同一投票者は1票のみ)
  const candidateIds = nodes
    .filter((node) => node.alive && node.role === "candidate")
    .map((node) => node.id)
    .sort((a, b) => a - b);
  for (const candidateId of candidateIds) {
    const candidate = byId.get(candidateId);
    if (!candidate || candidate.role !== "candidate") continue;
    const votes = new Set<number>([candidate.id]);
    for (const voter of nodes) {
      if (voter.id === candidate.id || !voter.alive || !canReach(nextState, candidate, voter)) continue;
      if (voter.currentTerm > candidate.currentTerm) continue;
      if (voter.currentTerm < candidate.currentTerm) {
        voter.currentTerm = candidate.currentTerm;
        voter.votedFor = null;
        if (voter.role === "leader") voter.role = "follower";
      }
      if (voter.votedFor === null || voter.votedFor === candidate.id) {
        voter.votedFor = candidate.id;
        if (voter.role !== "leader") voter.role = "follower";
        votes.add(voter.id);
      }
    }
    if (votes.size >= QUORUM) {
      candidate.role = "leader";
      candidate.matchIndex = { [candidate.id]: candidate.log.length };
    }
  }

  return nextState;
}

export const raftDefinition: SimEngineDefinition<RaftState, RaftAction> = {
  createInitialState,
  applyAction,
  advance,
};

export function createRaftEngine(seed?: number): SimEngine<RaftState, RaftAction> {
  return createSimEngine(raftDefinition, { seed });
}

export function describeRaftState(state: RaftState, locale: Locale): string {
  const t = getMessages(locale).raftViz.narrator;
  const leader = state.nodes.find((node) => node.alive && node.role === "leader");
  const maxTerm = state.nodes.reduce((max, node) => Math.max(max, node.currentTerm), 0);
  let text = leader
    ? formatMessage(t.leader, { term: leader.currentTerm, id: leader.id + 1, commitIndex: leader.commitIndex })
    : formatMessage(t.noLeader, { term: maxTerm });

  if (state.partitionSplit > 0 && state.partitionSplit < CLUSTER_SIZE) {
    text += formatMessage(t.partitioned, {
      a: state.partitionSplit,
      b: CLUSTER_SIZE - state.partitionSplit,
    });
  }
  const stoppedCount = state.nodes.filter((node) => !node.alive).length;
  if (stoppedCount > 0) {
    text += formatMessage(t.stopped, { count: stoppedCount });
  }
  return text;
}

export const raftNarratable: A11yNarratable<RaftState> = {
  describeState: describeRaftState,
};
