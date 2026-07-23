import { Hono } from "hono";
import type { Context } from "hono";
import type { PrismaClient } from "@/lib/generated/prisma-workerd/client";
import { isSupportedGraderVersion } from "@/lib/submissions/graderVersion";
import {
  GetSubmissionQuerySchema,
  PostSubmissionRequestSchema,
  type GetSubmissionResponse,
  type PostSubmissionResponse,
  type SubmissionLanguage,
  type SubmissionRecord,
  type SubmissionResult,
} from "@/lib/contracts";
import type { Env } from "../env";
import { verifyCsrfToken, CSRF_COOKIE_NAME } from "../csrf";
import { problemResponse } from "../problem";

/**
 * POST/GET /api/submissions。worker-appから移設(ADR-008/T-502)。
 * ロジックは app/api/submissions/route.ts(T-109)と同一(02§3.1)。
 */

type Bindings = Env;
type Variables = { userId: string; prisma: PrismaClient };

/** 02§2.1 submissionsテーブル「code は最大64KB(API側検証)」。413 code_too_large。 */
const MAX_CODE_BYTES = 64 * 1024;

interface SubmissionRow {
  id: string;
  exerciseSlug: string;
  language: string;
  code: string;
  result: string;
  passedTests: number;
  totalTests: number;
  durationMs: number | null;
  clientGraderVersion: string;
  createdAt: Date;
}

function toSubmissionRecord(row: SubmissionRow): SubmissionRecord {
  return {
    id: row.id,
    exerciseSlug: row.exerciseSlug,
    language: row.language as SubmissionLanguage,
    code: row.code,
    result: row.result as SubmissionResult,
    passedTests: row.passedTests,
    totalTests: row.totalTests,
    durationMs: row.durationMs,
    graderVersion: row.clientGraderVersion,
    createdAt: row.createdAt.toISOString(),
  };
}

export const submissionsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

submissionsRoute.post("/", async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
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

  if (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof (body as { code: unknown }).code === "string" &&
    Buffer.byteLength((body as { code: string }).code, "utf8") > MAX_CODE_BYTES
  ) {
    return problemResponse(
      c,
      413,
      "about:blank#code-too-large",
      "code_too_large",
      `code は最大${MAX_CODE_BYTES}バイトまでです`,
    );
  }

  const parsed = PostSubmissionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(
      c,
      400,
      "about:blank#validation-error",
      "validation_error",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  const {
    exerciseSlug,
    language,
    code,
    result,
    passedTests,
    totalTests,
    durationMs,
    graderVersion,
  } = parsed.data;

  if (!isSupportedGraderVersion(graderVersion)) {
    return problemResponse(
      c,
      422,
      "about:blank#grader-version-unsupported",
      "grader_version_unsupported",
      `graderVersion '${graderVersion}' はサポート対象外です`,
    );
  }

  const row = await prisma.submission.create({
    data: {
      userId,
      exerciseSlug,
      language,
      code,
      result,
      passedTests,
      totalTests,
      durationMs: durationMs ?? null,
      clientGraderVersion: graderVersion,
    },
  });

  const responseBody: PostSubmissionResponse = { id: row.id };
  return c.json(responseBody, 201);
});

submissionsRoute.get("/", async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  const userId = c.get("userId");
  const prisma = c.get("prisma");

  const query = GetSubmissionQuerySchema.safeParse({
    exercise: c.req.query("exercise") ?? undefined,
    latest: c.req.query("latest") ?? undefined,
  });
  if (!query.success) {
    return problemResponse(
      c,
      400,
      "about:blank#validation-error",
      "validation_error",
      query.error.issues.map((issue) => issue.message).join("; "),
    );
  }

  const row = await prisma.submission.findFirst({
    where: { userId, exerciseSlug: query.data.exercise },
    orderBy: { createdAt: "desc" },
  });

  const body: GetSubmissionResponse = {
    submission: row ? toSubmissionRecord(row) : null,
  };
  return c.json(body, 200);
});
