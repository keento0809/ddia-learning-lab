import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { CapstoneScenario } from "@/components/capstone/CapstoneScenario";
import { getCapstoneScenario } from "@/lib/scenario";
import { useCapstoneStore } from "@/lib/store/capstoneStore";

// capstoneStoreはモジュールスコープのシングルトン(言語切替をまたいだ状態保持のため、
// lib/store/labStore.tsと同じ設計)なので、テスト間の状態漏れを防ぐため毎回初期化する。
beforeEach(() => {
  useCapstoneStore.setState({ selection: {}, submitted: false });
});

describe("CapstoneScenario", () => {
  it("renders the brief and every design decision before any interaction, without a result section", () => {
    const scenario = getCapstoneScenario();
    const html = renderToStaticMarkup(<CapstoneScenario locale="ja" scenario={scenario} />);
    expect(html).toContain(scenario.brief.ja);
    for (const decision of scenario.decisions) {
      expect(html).toContain(`data-testid="capstone-decision-${decision.id}"`);
      expect(html).toContain(decision.prompt.ja);
    }
    expect(html).not.toContain('data-testid="capstone-result"');
  });

  it("renders the English locale text when locale=en", () => {
    const scenario = getCapstoneScenario();
    const html = renderToStaticMarkup(<CapstoneScenario locale="en" scenario={scenario} />);
    // brief.enはアポストロフィを含みHTMLエンティティ化される(&#x27;)ため、
    // 記号を含まない部分文字列で判定する。
    expect(html).toContain("timeline/posting service");
    expect(html).not.toContain(scenario.brief.ja);
  });

  it("disables the submit button before every decision has been answered", () => {
    const scenario = getCapstoneScenario();
    const html = renderToStaticMarkup(<CapstoneScenario locale="ja" scenario={scenario} />);
    expect(html).toMatch(/data-testid="capstone-submit"[^>]*disabled/);
  });

  // qa-evaluator検出: 01基本設計書F-08「言語切替(1クリック、状態保持)」。
  // next-intlの言語トグルは同一ルートへのクライアント側router.pushで、この
  // コンポーネント自体は再マウントされる(=新しいレンダーで検証する)。選択状態が
  // useStateではなくcapstoneStore(モジュールスコープのシングルトン)にあるため、
  // 再マウント後も選択内容が保持されることを確認する。
  it("keeps the selection across a component remount (simulating the locale toggle)", () => {
    const scenario = getCapstoneScenario();
    // 1回目のレンダー(例: /ja)で選択する。
    renderToStaticMarkup(<CapstoneScenario locale="ja" scenario={scenario} />);
    useCapstoneStore.getState().select("replication", "leaderless");
    useCapstoneStore.getState().select("partitioning", "hash");

    // コンポーネントの再マウント(例: 言語トグルによる/enへの遷移)を模す。
    const htmlAfterRemount = renderToStaticMarkup(
      <CapstoneScenario locale="en" scenario={scenario} />,
    );
    expect(useCapstoneStore.getState().selection).toEqual({
      replication: "leaderless",
      partitioning: "hash",
    });
    // 2軸のみ選択済み(3軸目未回答)なので送信ボタンはまだdisabledのまま。
    expect(htmlAfterRemount).toMatch(/data-testid="capstone-submit"[^>]*disabled/);
  });
});
