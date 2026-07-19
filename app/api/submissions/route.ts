import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { problemResponse } from "@/lib/auth/http";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, verifyCsrfToken } from "@/lib/api/csrf";
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

/**
 * POST/GET /api/submissions。03文書T-109 / 02§3.1「代表I/O定義」。
 */

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

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return problemResponse(401, "about:blank#unauthorized", "unauthorized");
  }

  if (!verifyCsrfToken(request)) {
    return problemResponse(
      403,
      "about:blank#csrf-token-invalid",
      "csrf_token_invalid",
      `cookie '${CSRF_COOKIE_NAME}' とヘッダ '${CSRF_HEADER_NAME}' が一致しません`,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "about:blank#invalid-json", "invalid_json");
  }

  // zodの.max()による400より先に、64KB超過を413として区別する(02§3.1)。
  if (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof (body as { code: unknown }).code === "string" &&
    Buffer.byteLength((body as { code: string }).code, "utf8") > MAX_CODE_BYTES
  ) {
    return problemResponse(
      413,
      "about:blank#code-too-large",
      "code_too_large",
      `code は最大${MAX_CODE_BYTES}バイトまでです`,
    );
  }

  const parsed = PostSubmissionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(
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
  return NextResponse.json(responseBody, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return problemResponse(401, "about:blank#unauthorized", "unauthorized");
  }

  const query = GetSubmissionQuerySchema.safeParse({
    exercise: request.nextUrl.searchParams.get("exercise") ?? undefined,
    latest: request.nextUrl.searchParams.get("latest") ?? undefined,
  });
  if (!query.success) {
    return problemResponse(
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
  return NextResponse.json(body, { status: 200 });
}
