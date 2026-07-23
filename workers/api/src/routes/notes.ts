import { Hono } from "hono";
import type { Context } from "hono";
import type { PrismaClient } from "@/lib/generated/prisma-workerd/client";
import { verifyCsrfToken, CSRF_COOKIE_NAME } from "../csrf";
import { problemResponse } from "../problem";
import {
  PutNoteRequestSchema,
  type GetNoteResponse,
  type NoteRecord,
} from "@/lib/contracts";
import type { Env } from "../env";

/**
 * PUT/GET /api/notes/{lessonSlug}。ADR-008(docs/design/09) §2・§4・02§3表#5-6。
 * 移設元のNext.js Route Handlerは存在しない(未実装だったハンドラ)ため、
 * 02§2.1 notesテーブル(T-004で既にマージ済み)とlib/contracts/api.ts(T-010で
 * 既にマージ済み)を根拠に新規実装する。T-307(ノート機能、03文書「2s debounce
 * 自動保存、DOMPurifyサニタイズ」)はクライアント側UIのみが対象範囲であり、
 * このAPI自体はT-307の依存先ではなくADR-008/T-502が移設対象として明示する
 * 5ハンドラの1つ(CLAUDE.md規則1のスコープ内)。
 *
 * lessonSlugは"01-reliability/01-load-and-performance"のような複数セグメントの
 * スラッシュ区切り文字列(progress APIのitemSlugと同じ命名規則)のため、
 * Honoの`/*`ワイルドカードでマウントし、パスから`/api/notes/`以降を取り出す。
 */

type Bindings = Env;
type Variables = { userId: string; prisma: PrismaClient };

/** 02§2.1 notesテーブル「body_md text 最大32KB」。413 note_too_large。 */
const MAX_BODY_MD_BYTES = 32 * 1024;

const NOTES_PATH_PREFIX = "/api/notes/";

function extractLessonSlug(path: string): string | null {
  if (!path.startsWith(NOTES_PATH_PREFIX)) return null;
  const raw = path.slice(NOTES_PATH_PREFIX.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

interface NoteRow {
  lessonSlug: string;
  bodyMd: string;
  updatedAt: Date;
}

function toNoteRecord(row: NoteRow): NoteRecord {
  return {
    lessonSlug: row.lessonSlug,
    bodyMd: row.bodyMd,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const notesRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

notesRoute.get("/*", async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  const lessonSlug = extractLessonSlug(c.req.path);
  if (!lessonSlug) {
    return problemResponse(c, 400, "about:blank#validation-error", "validation_error", "lessonSlugが指定されていません");
  }

  const userId = c.get("userId");
  const prisma = c.get("prisma");

  const row = await prisma.note.findUnique({
    where: { userId_lessonSlug: { userId, lessonSlug } },
  });

  const body: GetNoteResponse = { note: row ? toNoteRecord(row) : null };
  return c.json(body, 200);
});

notesRoute.put("/*", async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  const lessonSlug = extractLessonSlug(c.req.path);
  if (!lessonSlug) {
    return problemResponse(c, 400, "about:blank#validation-error", "validation_error", "lessonSlugが指定されていません");
  }

  const userId = c.get("userId");
  const prisma = c.get("prisma");

  if (!verifyCsrfToken(c)) {
    return problemResponse(
      c,
      403,
      "about:blank#csrf-token-invalid",
      "csrf_token_invalid",
      `cookie '${CSRF_COOKIE_NAME}' とヘッダの値が一致しません`,
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return problemResponse(c, 400, "about:blank#invalid-json", "invalid_json");
  }

  // zodの.max()による400より先に、32KB超過を413として区別する
  // (submissions.tsのcode/64KBチェックと同じ方針)。
  if (
    typeof body === "object" &&
    body !== null &&
    "bodyMd" in body &&
    typeof (body as { bodyMd: unknown }).bodyMd === "string" &&
    Buffer.byteLength((body as { bodyMd: string }).bodyMd, "utf8") > MAX_BODY_MD_BYTES
  ) {
    return problemResponse(
      c,
      413,
      "about:blank#note-too-large",
      "note_too_large",
      `bodyMd は最大${MAX_BODY_MD_BYTES}バイトまでです`,
    );
  }

  const parsed = PutNoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(
      c,
      400,
      "about:blank#validation-error",
      "validation_error",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }

  const row = await prisma.note.upsert({
    where: { userId_lessonSlug: { userId, lessonSlug } },
    update: { bodyMd: parsed.data.bodyMd },
    create: { userId, lessonSlug, bodyMd: parsed.data.bodyMd },
  });

  // lib/contracts/api.tsにPUT専用のレスポンス型は定義されていない(規則2により
  // 新規追加不可)ため、GetNoteResponseSchema({ note: NoteRecordSchema.nullable() })を
  // そのまま再利用する(PUT直後のnoteは常に非null)。
  const responseBody: GetNoteResponse = { note: toNoteRecord(row) };
  return c.json(responseBody, 200);
});
