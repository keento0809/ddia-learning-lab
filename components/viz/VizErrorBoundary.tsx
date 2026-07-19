"use client";

import { Component, type ReactNode } from "react";

interface VizErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface VizErrorBoundaryState {
  hasError: boolean;
}

/**
 * <Viz>専用のError Boundary(T-103受入基準「Vizは未登録名でError Boundaryに
 * フォールバックすること」、02§4.1)。クラスコンポーネントのライフサイクル
 * (getDerivedStateFromError/componentDidCatch)はClient Componentでのみ
 * 利用できるため"use client"。
 */
export class VizErrorBoundary extends Component<VizErrorBoundaryProps, VizErrorBoundaryState> {
  state: VizErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): VizErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Viz rendering error:", error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
