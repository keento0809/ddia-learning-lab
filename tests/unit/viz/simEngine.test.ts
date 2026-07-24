import { describe, expect, it, vi } from "vitest";
import { createSimEngine, type SimEngineDefinition } from "@/components/viz/core/simEngine";

/**
 * T-203受入基準「SimEngineの単体テスト(購読通知/リセット/決定性: 同一シード
 * 同一結果)」。counterDefinitionは乱数(rng)を消費するダミーの状態機械で、
 * 決定的乱数注入の検証を兼ねる。
 */
interface CounterState {
  count: number;
  rolls: number[];
}

type CounterAction = { type: "add"; amount: number } | { type: "rollAdd" };

const counterDefinition: SimEngineDefinition<CounterState, CounterAction> = {
  createInitialState: () => ({ count: 0, rolls: [] }),
  applyAction: (state, action, rng) => {
    if (action.type === "add") {
      return { ...state, count: state.count + action.amount };
    }
    return { count: state.count + 1, rolls: [...state.rolls, rng()] };
  },
  advance: (state, rng) => ({ count: state.count + 1, rolls: [...state.rolls, rng()] }),
};

describe("createSimEngine", () => {
  it("notifies subscribers with the new state on both dispatch and step", () => {
    const engine = createSimEngine(counterDefinition, { seed: 1 });
    const listener = vi.fn();
    engine.subscribe(listener);

    engine.dispatch({ type: "add", amount: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ count: 3 }));

    engine.step();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(engine.getState().count).toBe(4);
  });

  it("stops notifying once unsubscribed", () => {
    const engine = createSimEngine(counterDefinition, { seed: 1 });
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    unsubscribe();

    engine.dispatch({ type: "add", amount: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it("reset returns to the initial state and notifies subscribers", () => {
    const engine = createSimEngine(counterDefinition, { seed: 1 });
    engine.dispatch({ type: "add", amount: 5 });
    expect(engine.getState().count).toBe(5);

    const listener = vi.fn();
    engine.subscribe(listener);
    const resetState = engine.reset();

    expect(resetState).toEqual({ count: 0, rolls: [] });
    expect(engine.getState()).toEqual({ count: 0, rolls: [] });
    expect(listener).toHaveBeenCalledWith({ count: 0, rolls: [] });
  });

  it("is deterministic: the same seed and the same action/step sequence yield the same state", () => {
    const run = () => {
      const engine = createSimEngine(counterDefinition, { seed: 42 });
      engine.dispatch({ type: "rollAdd" });
      engine.step();
      engine.dispatch({ type: "rollAdd" });
      return engine.getState();
    };

    const first = run();
    const second = run();
    expect(second).toEqual(first);
    expect(first.rolls).toHaveLength(3);
    expect(first.rolls.every((roll) => roll >= 0 && roll < 1)).toBe(true);
  });

  it("reset reseeds the RNG so the post-reset sequence matches a fresh engine with the same seed", () => {
    const engineA = createSimEngine(counterDefinition, { seed: 7 });
    engineA.dispatch({ type: "rollAdd" });
    engineA.reset();
    engineA.dispatch({ type: "rollAdd" });

    const engineB = createSimEngine(counterDefinition, { seed: 7 });
    engineB.dispatch({ type: "rollAdd" });

    expect(engineA.getState()).toEqual(engineB.getState());
  });

  it("diverges for different seeds", () => {
    const engineA = createSimEngine(counterDefinition, { seed: 1 });
    const engineB = createSimEngine(counterDefinition, { seed: 2 });
    engineA.dispatch({ type: "rollAdd" });
    engineB.dispatch({ type: "rollAdd" });

    expect(engineA.getState().rolls[0]).not.toBe(engineB.getState().rolls[0]);
  });
});
