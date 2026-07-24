import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SvgStage } from "@/components/viz/core/SvgStage";

/**
 * T-203成果物「SvgStage(viewBox管理・レスポンシブ)」の基本レンダー検証。
 */
describe("SvgStage", () => {
  it("renders the viewBox attribute from the given logical coordinates", () => {
    const html = renderToStaticMarkup(
      <SvgStage viewBox={{ minX: 0, minY: 0, width: 400, height: 200 }}>
        <circle cx={10} cy={10} r={5} />
      </SvgStage>,
    );
    expect(html).toContain('viewBox="0 0 400 200"');
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("defaults to a responsive full-width class when none is provided", () => {
    const html = renderToStaticMarkup(
      <SvgStage viewBox={{ minX: 0, minY: 0, width: 100, height: 100 }}>
        <rect x={0} y={0} width={10} height={10} />
      </SvgStage>,
    );
    expect(html).toContain('class="h-auto w-full"');
  });

  it("allows overriding the className", () => {
    const html = renderToStaticMarkup(
      <SvgStage viewBox={{ minX: 0, minY: 0, width: 100, height: 100 }} className="custom-stage">
        <rect x={0} y={0} width={10} height={10} />
      </SvgStage>,
    );
    expect(html).toContain('class="custom-stage"');
  });
});
