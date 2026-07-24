import type { SimEngine } from "@/lib/contracts";
import { createSeededRandom, type RandomSource } from "./rng";

/**
 * SimEngine実装(02§8.1「可視化を、イベント列を発行する純粋な状態機械として
 * 実装するための基底」)。各Vizは状態S・アクションAに対しこの3関数のみを
 * 実装すればよく、購読通知・リセット・決定的乱数注入(createSeededRandomの
 * 再シード)はここに共通化する。
 */
export interface SimEngineDefinition<S, A> {
  /** 初期状態を生成する(reset時にも再実行される) */
  createInitialState(rng: RandomSource): S;
  /** dispatch(action)適用時の次状態を計算する */
  applyAction(state: S, action: A, rng: RandomSource): S;
  /** step()適用時の次状態を計算する(時間経過・自動再生用) */
  advance(state: S, rng: RandomSource): S;
}

export interface CreateSimEngineOptions {
  /** 乱数シード。省略時は固定の既定値(決定性維持のため) */
  seed?: number;
}

const DEFAULT_SEED = 1;

export function createSimEngine<S, A>(
  definition: SimEngineDefinition<S, A>,
  options: CreateSimEngineOptions = {},
): SimEngine<S, A> {
  const seed = options.seed ?? DEFAULT_SEED;
  let rng = createSeededRandom(seed);
  let state = definition.createInitialState(rng);
  const listeners = new Set<(state: S) => void>();

  function commit(next: S): S {
    state = next;
    for (const listener of listeners) {
      listener(state);
    }
    return state;
  }

  return {
    getState: () => state,
    dispatch: (action: A) => commit(definition.applyAction(state, action, rng)),
    step: () => commit(definition.advance(state, rng)),
    reset: () => {
      rng = createSeededRandom(seed);
      return commit(definition.createInitialState(rng));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
