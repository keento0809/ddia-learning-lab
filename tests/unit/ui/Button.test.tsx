// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/Button";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function mountContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return { container, root };
}

describe("Button", () => {
  it("defaults to the primary(brand) variant and default size", () => {
    const html = renderToStaticMarkup(<Button>{"送信"}</Button>);
    expect(html).toContain("bg-brand-500");
    expect(html).toContain("min-h-11");
    expect(html).toContain("送信");
  });

  it("applies secondary variant classes (neutral, bordered) instead of brand", () => {
    const html = renderToStaticMarkup(<Button variant="secondary">{"キャンセル"}</Button>);
    expect(html).toContain("border-neutral-300");
    expect(html).not.toContain("bg-brand-500");
    expect(html).not.toContain("bg-danger-600");
  });

  it("applies danger variant classes", () => {
    const html = renderToStaticMarkup(<Button variant="danger">{"削除"}</Button>);
    expect(html).toContain("bg-danger-600");
    expect(html).not.toContain("bg-brand-500");
  });

  it("keeps a >=44px tap target (min-h-11) for both default and small sizes", () => {
    const defaultHtml = renderToStaticMarkup(<Button size="default">{"既定"}</Button>);
    const smallHtml = renderToStaticMarkup(<Button size="small">{"小"}</Button>);
    expect(defaultHtml).toContain("min-h-11");
    expect(smallHtml).toContain("min-h-11");
  });

  it("renders the disabled attribute and disabled styling when disabled", () => {
    const html = renderToStaticMarkup(<Button disabled>{"送信中…"}</Button>);
    // Tailwindのクラス文字列"disabled:opacity-60"にも"disabled"が部分一致するため、
    // 実際のdisabled属性の有無はdisabled=""(boolean属性のSSR表現)で判定する
    // (tests/unit/quiz/QuizQuestionCard.test.tsxの既存パターンに揃える)。
    expect(html).toContain('disabled=""');
    expect(html).toContain("disabled:opacity-60");
  });

  it("does not render the disabled attribute when not disabled", () => {
    const html = renderToStaticMarkup(<Button>{"送信"}</Button>);
    expect(html).not.toContain('disabled=""');
  });

  it("forwards a data-testid and calls the click handler on click", async () => {
    const onClick = vi.fn();
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <Button data-testid="test-button" onClick={onClick}>
          {"クリック"}
        </Button>,
      );
    });

    const button = container.querySelector<HTMLButtonElement>('[data-testid="test-button"]')!;
    expect(button).not.toBeNull();

    act(() => {
      button.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("does not call the click handler when disabled", async () => {
    const onClick = vi.fn();
    const { container, root } = mountContainer();

    await act(async () => {
      root.render(
        <Button data-testid="test-button-disabled" disabled onClick={onClick}>
          {"クリック"}
        </Button>,
      );
    });

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="test-button-disabled"]',
    )!;
    expect(button.disabled).toBe(true);

    act(() => {
      button.click();
    });
    expect(onClick).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
