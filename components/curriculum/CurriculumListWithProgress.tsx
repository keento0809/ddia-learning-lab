"use client";

import { useProgressQuery } from "@/lib/progress/useProgressQuery";
import { computeCurriculumProgress } from "@/lib/progress/moduleProgress";
import type { Locale } from "@/lib/i18n/messages";
import type { CurriculumModuleSummary } from "@/lib/curriculum";
import { CurriculumList } from "./CurriculumList";

/**
 * S-02 カリキュラム一覧への進捗オーバーレイ接続(T-105、02§4.3)。
 * CurriculumList自体はhookを使わない純粋な描画コンポーネントのまま保ち
 * (tests/unit/curriculum/CurriculumList.test.tsxの直接呼び出しパターンを維持)、
 * ここでGET /api/progressの結果からモジュールごとの進捗率を算出してpropとして
 * 注入する。
 */
export function CurriculumListWithProgress({
  locale,
  modules,
  isAuthenticated,
}: {
  locale: Locale;
  modules: readonly CurriculumModuleSummary[];
  isAuthenticated: boolean;
}) {
  const query = useProgressQuery({ enabled: isAuthenticated });
  const progress = computeCurriculumProgress(modules, query.data?.progress ?? []);
  return <CurriculumList locale={locale} modules={modules} progress={progress} />;
}
