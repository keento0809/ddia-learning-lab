import { beforeEach, describe, expect, it } from "vitest";
import { useCapstoneStore } from "@/lib/store/capstoneStore";

// capstoneStoreはモジュールスコープのシングルトンのため、テスト間の状態漏れを
// 防ぐために各テスト前にデータ部分のみ初期化する(lib/store/labStore.tsと同じ理由)。
beforeEach(() => {
  useCapstoneStore.setState({ selection: {}, submitted: false });
});

describe("capstoneStore", () => {
  it("starts with no selection and not submitted", () => {
    expect(useCapstoneStore.getState().selection).toEqual({});
    expect(useCapstoneStore.getState().submitted).toBe(false);
  });

  it("select() sets the option for the given axis without touching other axes", () => {
    useCapstoneStore.getState().select("replication", "leaderless");
    useCapstoneStore.getState().select("partitioning", "hash");
    expect(useCapstoneStore.getState().selection).toEqual({
      replication: "leaderless",
      partitioning: "hash",
    });
  });

  it("select() overwrites a previous choice on the same axis", () => {
    useCapstoneStore.getState().select("replication", "single-leader");
    useCapstoneStore.getState().select("replication", "leaderless");
    expect(useCapstoneStore.getState().selection.replication).toBe("leaderless");
  });

  it("select() clears the submitted flag (changing a choice invalidates the shown result)", () => {
    useCapstoneStore.setState({ submitted: true });
    useCapstoneStore.getState().select("consistency", "eventual");
    expect(useCapstoneStore.getState().submitted).toBe(false);
  });

  it("submit() sets submitted to true", () => {
    useCapstoneStore.getState().submit();
    expect(useCapstoneStore.getState().submitted).toBe(true);
  });

  it("reset() clears both the selection and the submitted flag", () => {
    useCapstoneStore.getState().select("replication", "leaderless");
    useCapstoneStore.getState().submit();
    useCapstoneStore.getState().reset();
    expect(useCapstoneStore.getState().selection).toEqual({});
    expect(useCapstoneStore.getState().submitted).toBe(false);
  });
});
