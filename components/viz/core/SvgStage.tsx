import type { ReactNode } from "react";

export interface SvgStageViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface SvgStageProps {
  viewBox: SvgStageViewBox;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Viz共通のSVGキャンバス(02§8.1 SvgStage「viewBox管理、レスポンシブ」)。
 * viewBoxで論理座標系を固定し、preserveAspectRatio + 幅100%/高さautoで
 * コンテナ幅に追従させる。pan/zoomは「必要時」(02§8.1)のみ個別Viz側で
 * 追加する想定のためここでは持たない。
 */
export function SvgStage({ viewBox, ariaLabel, className, children }: SvgStageProps) {
  return (
    <svg
      viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      className={className ?? "h-auto w-full"}
      data-testid="viz-svg-stage"
    >
      {children}
    </svg>
  );
}
