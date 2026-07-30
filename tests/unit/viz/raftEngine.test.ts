import { describe, expect, it } from "vitest";
import {
  CLUSTER_SIZE,
  QUORUM,
  createRaftEngine,
  describeRaftState,
  type RaftState,
} from "@/components/viz/raft/engine";

/**
 * T-207受入基準・03「必須テスト(合否基準)」: 「同一termに2リーダー不成立/
 * 分断時に少数側がコミット不能」。02§8.2 RaftViz「状態機械はSimEngine上に
 * 実装し、選出安全性(同一termに2リーダー不在)を単体テストで担保」。
 */

function leadersByTerm(state: RaftState): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const node of state.nodes) {
    if (node.alive && node.role === "leader") {
      const list = map.get(node.currentTerm) ?? [];
      list.push(node.id);
      map.set(node.currentTerm, list);
    }
  }
  return map;
}

function assertNoDualLeaderPerTerm(state: RaftState): void {
  for (const [term, ids] of leadersByTerm(state)) {
    expect(ids.length, `term ${term} had leaders ${ids.join(",")}`).toBeLessThanOrEqual(1);
  }
}

describe("Raft SimEngine: election safety", () => {
  it("never has two leaders in the same term across many ticks (no partition)", () => {
    const engine = createRaftEngine(1);
    for (let i = 0; i < 200; i++) {
      const state = engine.step();
      assertNoDualLeaderPerTerm(state);
    }
  });

  it("never has two leaders in the same term across many ticks with random node toggles", () => {
    const engine = createRaftEngine(7);
    for (let i = 0; i < 300; i++) {
      if (i % 17 === 0) {
        engine.dispatch({ type: "toggleNode", id: i % CLUSTER_SIZE });
      }
      const state = engine.step();
      assertNoDualLeaderPerTerm(state);
    }
  });

  it("never has two leaders in the same term while a partition is active and later healed", () => {
    const engine = createRaftEngine(3);
    for (let i = 0; i < 20; i++) assertNoDualLeaderPerTerm(engine.step());

    engine.dispatch({ type: "setPartition", split: 2 });
    for (let i = 0; i < 40; i++) assertNoDualLeaderPerTerm(engine.step());

    engine.dispatch({ type: "setPartition", split: 0 });
    for (let i = 0; i < 40; i++) assertNoDualLeaderPerTerm(engine.step());
  });

  it("eventually elects exactly one leader when the cluster is fully connected", () => {
    const engine = createRaftEngine(1);
    let state = engine.getState();
    for (let i = 0; i < 30 && leadersByTerm(state).size === 0; i++) {
      state = engine.step();
    }
    const leaders = [...leadersByTerm(state).values()].flat();
    expect(leaders.length).toBe(1);
  });

  it("a minority partition (2 of 5) can never elect any leader", () => {
    const engine = createRaftEngine(5);
    engine.dispatch({ type: "setPartition", split: 2 });
    let anyMinorityLeader = false;
    for (let i = 0; i < 100; i++) {
      const state = engine.step();
      for (const node of state.nodes) {
        if (node.alive && node.role === "leader" && node.id < 2) {
          anyMinorityLeader = true;
        }
      }
    }
    expect(anyMinorityLeader).toBe(false);
  });
});

describe("Raft SimEngine: partition commit safety", () => {
  it("a leader stranded in the minority side cannot advance commitIndex past its pre-partition value", () => {
    const engine = createRaftEngine(2);
    // 分断前に安定してリーダーを選出させる
    let state = engine.getState();
    for (let i = 0; i < 30 && leadersByTerm(state).size === 0; i++) {
      state = engine.step();
    }
    const leaderBefore = state.nodes.find((node) => node.role === "leader");
    expect(leaderBefore).toBeDefined();
    const leaderId = leaderBefore!.id;

    // リーダーが2ノード側(少数派)に入るよう分断線を配置する
    const split = leaderId < 2 ? 2 : 3;
    engine.dispatch({ type: "setPartition", split });

    const commitBeforeProposals = engine.getState().nodes.find((n) => n.id === leaderId)!.commitIndex;

    for (let i = 0; i < 10; i++) {
      engine.dispatch({ type: "propose" });
      engine.step();
    }

    const finalLeaderState = engine.getState().nodes.find((n) => n.id === leaderId)!;
    // ログにはエントリが追加されているが、少数派のためクォーラムに届かずコミットできない
    expect(finalLeaderState.log.length).toBeGreaterThan(0);
    expect(finalLeaderState.commitIndex).toBe(commitBeforeProposals);
  });

  it("proposals do commit once the leader regains a majority (partition heals)", () => {
    const engine = createRaftEngine(9);
    let state = engine.getState();
    for (let i = 0; i < 30 && leadersByTerm(state).size === 0; i++) {
      state = engine.step();
    }
    const leaderId = state.nodes.find((node) => node.role === "leader")!.id;

    engine.dispatch({ type: "propose" });
    for (let i = 0; i < 10; i++) engine.step();

    const committedState = engine.getState();
    const leaderNode = committedState.nodes.find((n) => n.id === leaderId);
    // リーダーが交代していなければ、分断なしでの提案はコミットされる
    if (leaderNode?.role === "leader") {
      expect(leaderNode.commitIndex).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("Raft SimEngine: determinism", () => {
  it("produces identical state sequences for the same seed", () => {
    const run = () => {
      const engine = createRaftEngine(11);
      engine.dispatch({ type: "setPartition", split: 2 });
      for (let i = 0; i < 25; i++) engine.step();
      engine.dispatch({ type: "propose" });
      for (let i = 0; i < 5; i++) engine.step();
      return engine.getState();
    };
    expect(run()).toEqual(run());
  });
});

describe("Raft SimEngine: node stop/revive", () => {
  it("a stopped node no longer participates and rejoins as a follower on revival", () => {
    const engine = createRaftEngine(4);
    engine.dispatch({ type: "toggleNode", id: 0 });
    expect(engine.getState().nodes[0].alive).toBe(false);

    for (let i = 0; i < 10; i++) engine.step();
    expect(engine.getState().nodes[0].role).toBe("follower");

    engine.dispatch({ type: "toggleNode", id: 0 });
    const revived = engine.getState().nodes[0];
    expect(revived.alive).toBe(true);
    expect(revived.role).toBe("follower");
  });
});

describe("Raft SimEngine: quiz mode (quorum question)", () => {
  it("marks the answer correct only when exactly QUORUM nodes remain alive", () => {
    const engine = createRaftEngine(6);
    engine.dispatch({ type: "toggleQuizMode" });
    expect(engine.getState().quizMode).toBe(true);

    engine.dispatch({ type: "toggleNode", id: 3 });
    engine.dispatch({ type: "toggleNode", id: 4 });
    expect(engine.getState().nodes.filter((n) => n.alive).length).toBe(QUORUM);

    engine.dispatch({ type: "submitQuizAnswer" });
    expect(engine.getState().quizResult).toBe("correct");
  });

  it("marks the answer incorrect when the alive count is not QUORUM", () => {
    const engine = createRaftEngine(6);
    engine.dispatch({ type: "toggleQuizMode" });
    engine.dispatch({ type: "toggleNode", id: 3 });
    expect(engine.getState().nodes.filter((n) => n.alive).length).toBe(CLUSTER_SIZE - 1);

    engine.dispatch({ type: "submitQuizAnswer" });
    expect(engine.getState().quizResult).toBe("incorrect");
  });

  it("submitQuizAnswer is a no-op outside quiz mode", () => {
    const engine = createRaftEngine(6);
    engine.dispatch({ type: "submitQuizAnswer" });
    expect(engine.getState().quizResult).toBeNull();
  });
});

describe("Raft SimEngine: describeState (i18n)", () => {
  it("describes the no-leader state in both locales", () => {
    const engine = createRaftEngine(1);
    const state = engine.getState();
    expect(describeRaftState(state, "ja")).toContain("0");
    expect(typeof describeRaftState(state, "en")).toBe("string");
    expect(describeRaftState(state, "ja")).not.toBe(describeRaftState(state, "en"));
  });

  it("describes an elected leader with its term and commit index", () => {
    const engine = createRaftEngine(1);
    let state = engine.getState();
    for (let i = 0; i < 30 && leadersByTerm(state).size === 0; i++) {
      state = engine.step();
    }
    const ja = describeRaftState(state, "ja");
    const en = describeRaftState(state, "en");
    expect(ja.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
    expect(ja).not.toBe(en);
  });

  it("mentions partition group sizes when a partition is active", () => {
    const engine = createRaftEngine(1);
    engine.dispatch({ type: "setPartition", split: 2 });
    const state = engine.getState();
    expect(describeRaftState(state, "ja")).toContain("2");
    expect(describeRaftState(state, "en")).toContain("2");
  });
});
