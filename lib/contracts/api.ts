import { z } from "zod";

/**
 * REST API (Route Handlers) の入出力コントラクト。
 * 参照設計: docs/design/02_詳細設計書.md §3 API詳細設計
 */

/** progress.item_type。02 §2.1 progressテーブル / §3.1 PUT /api/progress */
export const ProgressItemTypeSchema = z.enum(["lesson", "quiz", "exercise"]);
export type ProgressItemType = z.infer<typeof ProgressItemTypeSchema>;

/** progress.status。02 §2.1 / §3.1(statusの後退は無視=単調) */
export const ProgressStatusSchema = z.enum(["in_progress", "done"]);
export type ProgressStatus = z.infer<typeof ProgressStatusSchema>;

/** 02 §2.1 progress テーブルのAPI表現(1行) */
export const ProgressRecordSchema = z.object({
  id: z.string(),
  itemType: ProgressItemTypeSchema,
  itemSlug: z.string(),
  status: ProgressStatusSchema,
  score: z.number().int().min(0).max(100).nullable(),
  completedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type ProgressRecord = z.infer<typeof ProgressRecordSchema>;

/** GET /api/progress?module={slug} 。02 §3 表#1 */
export const GetProgressQuerySchema = z.object({
  module: z.string().optional(),
});
export type GetProgressQuery = z.infer<typeof GetProgressQuerySchema>;

export const GetProgressResponseSchema = z.object({
  progress: z.array(ProgressRecordSchema),
});
export type GetProgressResponse = z.infer<typeof GetProgressResponseSchema>;

/**
 * PUT /api/progress リクエスト。02 §3.1「代表I/O定義」。
 * itemSlugはビルド時slugマニフェスト(§9, lib/contracts/manifest.ts)に対して
 * サーバ側で照合し、未知slugは409(slug_unknown)とする。
 */
export const PutProgressRequestSchema = z.object({
  itemType: ProgressItemTypeSchema,
  itemSlug: z.string().min(1),
  status: ProgressStatusSchema,
  score: z.number().int().min(0).max(100).optional(),
  clientTz: z.string().min(1),
});
export type PutProgressRequest = z.infer<typeof PutProgressRequestSchema>;

/** 02 §3.1 PUT /api/progress レスポンス(streak/newBadges含む) */
export const StreakSchema = z.object({
  currentDays: z.number().int().min(0),
  longestDays: z.number().int().min(0).optional(),
});
export type Streak = z.infer<typeof StreakSchema>;

export const BadgeSchema = z.object({
  slug: z.string(),
  grantedAt: z.string().optional(),
});
export type Badge = z.infer<typeof BadgeSchema>;

export const PutProgressResponseSchema = z.object({
  progress: ProgressRecordSchema,
  streak: StreakSchema,
  newBadges: z.array(BadgeSchema),
});
export type PutProgressResponse = z.infer<typeof PutProgressResponseSchema>;

/**
 * POST /api/submissions リクエスト。02 §3.1「代表I/O定義」/ §2.1 submissionsテーブル。
 * code は最大64KB(APIで検証、413 code_too_large)。
 */
export const SubmissionLanguageSchema = z.enum(["js", "sql"]);
export type SubmissionLanguage = z.infer<typeof SubmissionLanguageSchema>;

export const SubmissionResultSchema = z.enum([
  "pass",
  "fail",
  "error",
  "timeout",
]);
export type SubmissionResult = z.infer<typeof SubmissionResultSchema>;

export const PostSubmissionRequestSchema = z.object({
  exerciseSlug: z.string().min(1),
  language: SubmissionLanguageSchema,
  code: z.string().max(64 * 1024),
  result: SubmissionResultSchema,
  passedTests: z.number().int().min(0),
  totalTests: z.number().int().min(0),
  durationMs: z.number().int().min(0).optional(),
  graderVersion: z.string().min(1),
});
export type PostSubmissionRequest = z.infer<typeof PostSubmissionRequestSchema>;

/** 02 §3.1 POST /api/submissions レスポンス(201) */
export const PostSubmissionResponseSchema = z.object({
  id: z.string(),
});
export type PostSubmissionResponse = z.infer<
  typeof PostSubmissionResponseSchema
>;

/** GET /api/submissions?exercise={slug}&latest=1 。02 §3 表#4 */
export const GetSubmissionQuerySchema = z.object({
  exercise: z.string().min(1),
  latest: z.literal("1").optional(),
});
export type GetSubmissionQuery = z.infer<typeof GetSubmissionQuerySchema>;

export const SubmissionRecordSchema = z.object({
  id: z.string(),
  exerciseSlug: z.string(),
  language: SubmissionLanguageSchema,
  code: z.string(),
  result: SubmissionResultSchema,
  passedTests: z.number().int().min(0),
  totalTests: z.number().int().min(0),
  durationMs: z.number().int().min(0).nullable(),
  graderVersion: z.string(),
  createdAt: z.string(),
});
export type SubmissionRecord = z.infer<typeof SubmissionRecordSchema>;

export const GetSubmissionResponseSchema = z.object({
  submission: SubmissionRecordSchema.nullable(),
});
export type GetSubmissionResponse = z.infer<typeof GetSubmissionResponseSchema>;

/** PUT/GET /api/notes/{lessonSlug} 。02 §3 表#5-6 / §2.1 notesテーブル(最大32KB) */
export const PutNoteRequestSchema = z.object({
  bodyMd: z.string().max(32 * 1024),
});
export type PutNoteRequest = z.infer<typeof PutNoteRequestSchema>;

export const NoteRecordSchema = z.object({
  lessonSlug: z.string(),
  bodyMd: z.string(),
  updatedAt: z.string(),
});
export type NoteRecord = z.infer<typeof NoteRecordSchema>;

export const GetNoteResponseSchema = z.object({
  note: NoteRecordSchema.nullable(),
});
export type GetNoteResponse = z.infer<typeof GetNoteResponseSchema>;

/** GET /api/dashboard 。02 §3.1「代表I/O定義」 */
export const DashboardOverallSchema = z.object({
  lessonsDone: z.number().int().min(0),
  lessonsTotal: z.number().int().min(0),
  exercisesPassed: z.number().int().min(0),
});
export type DashboardOverall = z.infer<typeof DashboardOverallSchema>;

export const DashboardModuleProgressSchema = z.object({
  slug: z.string(),
  percent: z.number().min(0).max(100),
});
export type DashboardModuleProgress = z.infer<
  typeof DashboardModuleProgressSchema
>;

export const DashboardResumeSchema = z.object({
  itemType: ProgressItemTypeSchema,
  itemSlug: z.string(),
  titleKey: z.string(),
});
export type DashboardResume = z.infer<typeof DashboardResumeSchema>;

export const GetDashboardResponseSchema = z.object({
  overall: DashboardOverallSchema,
  modules: z.array(DashboardModuleProgressSchema),
  resume: DashboardResumeSchema.nullable(),
  streak: StreakSchema,
  badges: z.array(BadgeSchema),
});
export type GetDashboardResponse = z.infer<typeof GetDashboardResponseSchema>;

/**
 * POST /api/certificates 。02 §3 表#8 / §7.5 修了証発行時のサーバ側再検証。
 * 発行は非同期(申請→完了通知のUX)のため、応答はキューイング結果のみを返す。
 */
export const PostCertificateResponseSchema = z.object({
  status: z.enum(["queued"]),
  requestedAt: z.string(),
});
export type PostCertificateResponse = z.infer<
  typeof PostCertificateResponseSchema
>;

/**
 * POST /api/guest-progress/import 。02 §3 表#9 / §6 状態管理詳細(ゲスト進捗マージ)。
 * localStorage の `guest-progress` 配列をサーバへ取り込む。サーバ側はdone優先で統合。
 */
export const GuestProgressEntrySchema = z.object({
  itemType: ProgressItemTypeSchema,
  itemSlug: z.string().min(1),
  status: ProgressStatusSchema,
  score: z.number().int().min(0).max(100).optional(),
});
export type GuestProgressEntry = z.infer<typeof GuestProgressEntrySchema>;

export const PostGuestProgressImportRequestSchema = z.object({
  entries: z.array(GuestProgressEntrySchema),
  clientTz: z.string().min(1),
});
export type PostGuestProgressImportRequest = z.infer<
  typeof PostGuestProgressImportRequestSchema
>;

export const PostGuestProgressImportResponseSchema = z.object({
  imported: z.number().int().min(0),
  progress: z.array(ProgressRecordSchema),
});
export type PostGuestProgressImportResponse = z.infer<
  typeof PostGuestProgressImportResponseSchema
>;
