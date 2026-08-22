import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LabToolbar } from "@/components/lab/LabToolbar";

/**
 * 失敗→恒久対策(モバイル診断): 375px/414px幅で以下2件が発生していた。
 * (1) ステータスラベル(不合格/編集中等)がflex-shrinkにより
 *     whitespace-nowrap無しだとCJK文字境界で2行に分断される
 * (2) 実行ボタンのショートカット表記(⌘/Ctrl + Enter)がタッチ操作でも
 *     常時表示されボタン内で折り返す
 * SSR文字列に対するクラス名検査で、これらのCSS的対策(whitespace-nowrap /
 * pointer-coarse:hidden)が実際にマークアップへ出力されていることを固定する。
 */
describe("LabToolbar (mobile layout)", () => {
  function render(status: "idle" | "passed" | "failed" = "idle") {
    return renderToStaticMarkup(
      <LabToolbar
        status={status}
        onRun={() => {}}
        onReset={() => {}}
        autosaving={false}
        locale="ja"
      />,
    );
  }

  it("keeps the status label on one line via whitespace-nowrap", () => {
    const html = render("failed");
    const statusMatch = html.match(
      /<span data-testid="lab-status-label"[^>]*class="([^"]*)"[^>]*>不合格<\/span>/,
    );
    expect(statusMatch).not.toBeNull();
    expect(statusMatch![1]).toContain("whitespace-nowrap");
  });

  it("keeps the autosave indicator on one line via whitespace-nowrap", () => {
    const html = render("idle");
    const autosaveMatch = html.match(
      /<span class="([^"]*)"[^>]*data-testid="lab-autosave-indicator"/,
    );
    expect(autosaveMatch).not.toBeNull();
    expect(autosaveMatch![1]).toContain("whitespace-nowrap");
  });

  it("hides the run button's shortcut hint on coarse (touch) pointers via pointer-coarse:hidden", () => {
    const html = render("idle");
    expect(html).toContain("pointer-coarse:hidden");
    // ショートカット表記自体はDOM上に残る(SSR静的HTMLはメディアクエリを評価
    // しないため常に存在する)。あくまでCSSクラスでの出し分けを検証する。
    expect(html).toContain("⌘/Ctrl + Enter");
  });
});
