"use client";

import { useEffect, useState } from "react";

/**
 * T-601スパイク: 方式B(静的プレビュー+認証付きフェッチ)の最小プロトタイプ。
 * クライアント側でworker-api(/api/spike-content/:locale、service binding経由で
 * worker-appの汎用フォワーダ app/api/[...path]/route.ts が中継)を叩き、
 * 200なら本文を、401ならウォールを表示する。HttpOnly Cookieのため、
 * 認証状態をクライアント側で事前判定できず、未認証でも必ず1回フェッチを試みる
 * (実測メモ: Worker invocation数に反映)。
 */
type FetchState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "error" }
  | { status: "ok"; body: string };

export function SpikeGateBBody({
  locale,
  loadingLabel,
  wallTitle,
  wallBody,
}: {
  locale: "ja" | "en";
  loadingLabel: string;
  wallTitle: string;
  wallBody: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/spike-content/${locale}`, { credentials: "same-origin" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setState({ status: "unauthorized" });
          return;
        }
        if (!res.ok) {
          setState({ status: "error" });
          return;
        }
        const data = (await res.json()) as { body: string };
        setState({ status: "ok", body: data.body });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (state.status === "loading") {
    return <p aria-live="polite">{loadingLabel}</p>;
  }

  if (state.status === "ok") {
    return (
      <article>
        {state.body.split("\n\n").map((block, i) => (
          <p key={i} style={{ whiteSpace: "pre-wrap" }}>
            {block}
          </p>
        ))}
      </article>
    );
  }

  return (
    <section
      role="region"
      aria-label={wallTitle}
      style={{ marginTop: "1.5rem", padding: "1.25rem", border: "1px solid #8884", borderRadius: 8 }}
    >
      <p style={{ fontWeight: 600 }}>
        {"🔒 "}
        {wallTitle}
      </p>
      <p>{wallBody}</p>
    </section>
  );
}
