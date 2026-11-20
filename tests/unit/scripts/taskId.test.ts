import { describe, expect, it } from "vitest";
import {
  collectUsedIds,
  evaluatePullRequest,
  extractTaskIds,
  findUsages,
  nextTaskId,
  parseTaskId,
  reserveTaskId,
  reservedIdsFromTagNames,
} from "../../../scripts/lib/task-id.mjs";

type Source = { label: string; text: string };

function fakeClient({
  reserved = [],
  sources = [],
  taken = [],
}: {
  reserved?: string[];
  sources?: Source[];
  taken?: string[];
}) {
  const created: { id: string; summary: string }[] = [];
  const takenIds = new Set(taken);
  return {
    created,
    listReservedIds: async () => new Set(reserved),
    listSources: async () => sources,
    createReservation: async (id: string, summary: string) => {
      if (takenIds.has(id)) return false;
      takenIds.add(id);
      created.push({ id, summary });
      return true;
    },
  };
}

describe("extractTaskIds", () => {
  it("ブランチ名とPRタイトルからIDを取り出す", () => {
    expect([...extractTaskIds("fix/T-711-swc-helpers-override")]).toEqual([
      "T-711",
    ]);
    expect([...extractTaskIds("docs(adr): add ADR-013 draft (T-713)")]).toEqual(
      ["T-713"],
    );
  });

  it("枝番は親IDへ正規化する", () => {
    expect([...extractTaskIds("T-705a と T-705b")]).toEqual(["T-705"]);
  });

  it("範囲予約は途中の番号まで展開する", () => {
    expect([...extractTaskIds("T-715〜T-718=強化")]).toEqual([
      "T-715",
      "T-718",
      "T-716",
      "T-717",
    ]);
  });

  it("IDに見えるだけの文字列は拾わない", () => {
    expect(extractTaskIds("ST-712 と T-7123 と T-71").size).toBe(0);
  });
});

describe("parseTaskId", () => {
  it("形式が正しいIDのみ受け付ける", () => {
    expect(parseTaskId("t-730")).toBe("T-730");
    expect(parseTaskId("T-73")).toBeNull();
    expect(parseTaskId("T-730-extra")).toBeNull();
  });
});

describe("nextTaskId", () => {
  it("同じ系列の最大値の次を返す", () => {
    expect(nextTaskId(new Set(["T-501", "T-725", "T-712"]))).toBe("T-726");
  });

  it("系列の番号を使い切ったら自動採番を止める", () => {
    expect(() => nextTaskId(new Set(["T-799"]))).toThrow("使い切りました");
  });
});

describe("collectUsedIds / findUsages", () => {
  const sources = [
    { label: "STATUS", text: "T-715〜T-717=強化" },
    { label: "PR #1", text: "fix (T-712)\nfix/T-712-guard" },
  ];

  it("範囲予約の途中の番号も使用済みとして扱う", () => {
    expect(collectUsedIds(sources).has("T-716")).toBe(true);
    expect(findUsages("T-716", sources)).toEqual(["STATUS"]);
  });

  it("使われていないIDは使用箇所なしになる", () => {
    expect(findUsages("T-726", sources)).toEqual([]);
  });
});

describe("reservedIdsFromTagNames", () => {
  it("予約タグのみをIDへ変換する", () => {
    const ids = reservedIdsFromTagNames([
      "task-id/T-726",
      "v1.0.0",
      "task-id/invalid",
    ]);
    expect([...ids]).toEqual(["T-726"]);
  });
});

describe("reserveTaskId", () => {
  it("次の空き番号を作業概要つきで予約する", async () => {
    const client = fakeClient({ reserved: ["T-725"] });
    await expect(reserveTaskId(client, { summary: "作業" })).resolves.toBe(
      "T-726",
    );
    expect(client.created).toEqual([{ id: "T-726", summary: "作業" }]);
  });

  it("先着に負けたら次の番号で予約し直す", async () => {
    const client = fakeClient({
      reserved: ["T-725"],
      taken: ["T-726", "T-727"],
    });
    await expect(reserveTaskId(client, { summary: "作業" })).resolves.toBe(
      "T-728",
    );
  });

  it("タグのない使用痕跡(未pushブランチ等)を避けて採番する", async () => {
    const client = fakeClient({
      reserved: ["T-725"],
      sources: [{ label: "ローカルブランチ", text: "feat/T-730-wip" }],
    });
    await expect(reserveTaskId(client, { summary: "作業" })).resolves.toBe(
      "T-731",
    );
  });

  it("作業概要が空なら予約しない", async () => {
    const client = fakeClient({});
    await expect(reserveTaskId(client, { summary: " " })).rejects.toThrow(
      "作業概要",
    );
    expect(client.created).toEqual([]);
  });

  it("予約済みのIDは指定できない", async () => {
    const client = fakeClient({ reserved: ["T-730"] });
    await expect(
      reserveTaskId(client, {
        summary: "作業",
        id: "T-730",
        allowExisting: true,
      }),
    ).rejects.toThrow("既に予約済み");
    expect(client.created).toEqual([]);
  });

  it("使用痕跡のあるIDは --existing がなければ止める", async () => {
    const sources = [{ label: "PR #188", text: "fix/T-711" }];
    const client = fakeClient({ sources });
    await expect(
      reserveTaskId(client, { summary: "作業", id: "T-711" }),
    ).rejects.toThrow("PR #188");
    expect(client.created).toEqual([]);
  });

  it("--existing があれば設計書で定義済みのIDを予約できる", async () => {
    const client = fakeClient({
      sources: [{ label: "docs/design/11", text: "T-706 運用" }],
    });
    await expect(
      reserveTaskId(client, {
        summary: "作業",
        id: "T-706",
        allowExisting: true,
      }),
    ).resolves.toBe("T-706");
  });

  it("確認後に別セッションが先に予約したIDは失敗させる", async () => {
    const client = fakeClient({ taken: ["T-730"] });
    await expect(
      reserveTaskId(client, { summary: "作業", id: "T-730" }),
    ).rejects.toThrow("先に予約");
  });
});

describe("evaluatePullRequest", () => {
  const reservedIds = new Set(["T-726", "T-727"]);

  it("予約済みIDがタイトルとブランチで一致すれば通す", () => {
    const pr = {
      title: "chore: reserve IDs (T-726)",
      branch: "chore/T-726-reservation",
      reservedIds,
    };
    expect(evaluatePullRequest(pr)).toEqual([]);
  });

  it("未予約のIDを検出する", () => {
    const pr = { title: "fix (T-730)", branch: "fix/T-730-foo", reservedIds };
    expect(evaluatePullRequest(pr)).toEqual([
      expect.stringContaining("T-730 は未予約"),
    ]);
  });

  it("タイトルとブランチのID不一致を検出する", () => {
    const pr = { title: "docs (T-727)", branch: "docs/T-726-foo", reservedIds };
    const problems = evaluatePullRequest(pr);
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("T-727");
    expect(problems.join("\n")).toContain("T-726");
  });

  it("タイトルだけにIDがある場合も検出する", () => {
    const pr = { title: "fix (T-726)", branch: "fix/no-id", reservedIds };
    expect(evaluatePullRequest(pr)).toEqual([
      expect.stringContaining("ブランチ名"),
    ]);
  });

  it("T-725以前とIDなしのPRは対象外にする", () => {
    const empty = new Set<string>();
    expect(
      evaluatePullRequest({
        title: "docs (T-725)",
        branch: "docs/T-711-x",
        reservedIds: empty,
      }),
    ).toEqual([]);
    expect(
      evaluatePullRequest({
        title: "chore(deps): bump vite",
        branch: "dependabot/x",
        reservedIds: empty,
      }),
    ).toEqual([]);
  });
});

describe("reserveTaskId の境界", () => {
  it("上限回数まで先着に負け続けたら予約せずに失敗する", async () => {
    const taken = Array.from({ length: 10 }, (_, index) => `T-${726 + index}`);
    const client = fakeClient({ reserved: ["T-725"], taken });
    await expect(reserveTaskId(client, { summary: "作業" })).rejects.toThrow(
      "10回試しても",
    );
    expect(client.created).toEqual([]);
  });

  it("上限の直前で空きが出れば予約できる", async () => {
    const taken = Array.from({ length: 9 }, (_, index) => `T-${726 + index}`);
    const client = fakeClient({ reserved: ["T-725"], taken });
    await expect(reserveTaskId(client, { summary: "作業" })).resolves.toBe(
      "T-735",
    );
  });

  it("未使用のIDを指定すれば作業概要つきで予約する", async () => {
    const client = fakeClient({});
    await expect(
      reserveTaskId(client, { summary: "指定作業", id: "T-730" }),
    ).resolves.toBe("T-730");
    expect(client.created).toEqual([{ id: "T-730", summary: "指定作業" }]);
  });
});

describe("系列と大文字小文字", () => {
  it("上の系列のIDは次の番号の計算に含めない", () => {
    expect(nextTaskId(new Set(["T-725", "T-801"]))).toBe("T-726");
  });

  it("小文字のIDも検査対象にする", () => {
    const pr = {
      title: "fix (t-730)",
      branch: "fix/t-730-foo",
      reservedIds: new Set<string>(),
    };
    expect(evaluatePullRequest(pr)).toEqual([
      expect.stringContaining("T-730 は未予約"),
    ]);
  });
});
