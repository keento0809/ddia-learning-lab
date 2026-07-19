import type { ProgressItemType, ProgressRecord, ProgressStatus } from "@/lib/contracts";

/**
 * prisma.progress行 → API表現(ProgressRecord)の変換。
 * app/api/progress/route.ts(T-104)とapp/api/guest-progress/import/route.ts
 * (T-113)の両方が使う共通処理のため切り出す(Route HandlerファイルはGET/POST等
 * のHTTPメソッド以外の名前をexportできないため、ここに置く)。
 */
export interface ProgressRow {
  id: string;
  itemType: string;
  itemSlug: string;
  status: string;
  score: number | null;
  completedAt: Date | null;
  updatedAt: Date;
}

export function toProgressRecord(row: ProgressRow): ProgressRecord {
  return {
    id: row.id,
    itemType: row.itemType as ProgressItemType,
    itemSlug: row.itemSlug,
    status: row.status as ProgressStatus,
    score: row.score,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
