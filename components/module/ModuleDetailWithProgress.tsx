"use client";

import { useProgressQuery } from "@/lib/progress/useProgressQuery";
import type { Locale } from "@/lib/i18n/messages";
import type { ModuleDetailSummary } from "@/lib/moduleDetail";
import { ModuleDetail } from "./ModuleDetail";

/**
 * S-03 モジュール詳細への進捗オーバーレイ接続(T-105)。
 * ModuleDetail自体はhookを使わない純粋な描画コンポーネントのまま保ち
 * (tests/unit/module/ModuleDetail.test.tsxの直接呼び出しパターンを維持)、
 * ここでGET /api/progressの結果(未ログイン時は空)をpropとして注入する。
 */
export function ModuleDetailWithProgress({
  locale,
  detail,
  isAuthenticated,
}: {
  locale: Locale;
  detail: ModuleDetailSummary;
  isAuthenticated: boolean;
}) {
  const query = useProgressQuery({ enabled: isAuthenticated });
  return <ModuleDetail locale={locale} detail={detail} progress={query.data?.progress ?? []} />;
}
