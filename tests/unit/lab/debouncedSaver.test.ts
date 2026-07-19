import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedSaver } from "@/lib/lab/debouncedSaver";

// T-108受入基準(6)「ドラフトのlocalStorage自動保存(1s debounce)」の
// debounceトリガー自体の決定的な単体テスト(DOM/localStorage非依存)。
describe("createDebouncedSaver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not save before the delay elapses", () => {
    const save = vi.fn();
    const saver = createDebouncedSaver(save, 1000);
    saver.trigger("a");
    vi.advanceTimersByTime(999);
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the value once the delay elapses", () => {
    const save = vi.fn();
    const saver = createDebouncedSaver(save, 1000);
    saver.trigger("a");
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("a");
  });

  it("resets the timer on each trigger, saving only the last value", () => {
    const save = vi.fn();
    const saver = createDebouncedSaver(save, 1000);
    saver.trigger("a");
    vi.advanceTimersByTime(600);
    saver.trigger("b");
    vi.advanceTimersByTime(600);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("b");
  });

  it("cancel() prevents a pending save from firing", () => {
    const save = vi.fn();
    const saver = createDebouncedSaver(save, 1000);
    saver.trigger("a");
    saver.cancel();
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled();
  });
});
