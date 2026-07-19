import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { prisma } from "@/lib/db";
import { generateCsrfToken } from "@/lib/api/csrf";

/**
 * 03文書T-109 受入基準「API統合テスト(201/413/422)」。02§3.1 POST/GET /api/submissions。
 * 実行にはテスト用DB(docker-compose.test.yml)が必要。`npm run test:integration`から実行する。
 *
 * セッション解決(lib/auth/config.tsのauth())はT-005で検証済みのためモックし、
 * 提出APIのロジック(64KB制限/graderVersion検証/CRUD)に焦点を当てる
 * (tests/integration/progress.flow.integration.test.tsと同じ方針)。
 */
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));

const { auth } = await import("@/lib/auth/config");
const { GET, POST } = await import("@/app/api/submissions/route");

type SessionLike = { user: { id: string }; expires: string } | null;
const mockedAuth = auth as unknown as Mock<(...args: unknown[]) => Promise<SessionLike>>;

const BASE_URL = "http://localhost:3000/api/submissions";
const EXERCISE_SLUG = "03-storage/kv-store";

function csrfCookiePair(): { cookies: Record<string, string>; token: string } {
  const token = generateCsrfToken();
  return { cookies: { "csrf-token": token }, token };
}

function toCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function validSubmissionBody(overrides: Record<string, unknown> = {}) {
  return {
    exerciseSlug: EXERCISE_SLUG,
    language: "js",
    code: "export function put(k, v) { return v; }",
    result: "pass",
    passedTests: 8,
    totalTests: 8,
    durationMs: 412,
    graderVersion: "1.3.0",
    ...overrides,
  };
}

async function postSubmission(
  cookies: Record<string, string>,
  body: unknown,
  csrfToken?: string,
) {
  return POST(
    new NextRequest(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: toCookieHeader(cookies),
        ...(csrfToken !== undefined ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST/GET /api/submissions (T-109)", () => {
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const user = await prisma.user.create({
      data: { email: `submissions-${randomUUID()}@example.com`, displayName: "Submissions Test User" },
    });
    userId = user.id;
    mockedAuth.mockResolvedValue({
      user: { id: userId },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("401: 未認証のPOSTはunauthorizedを返す", async () => {
    mockedAuth.mockResolvedValue(null);
    const { cookies, token } = csrfCookiePair();
    const response = await postSubmission(cookies, validSubmissionBody(), token);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("unauthorized");
  });

  it("401: 未認証のGETはunauthorizedを返す", async () => {
    mockedAuth.mockResolvedValue(null);
    const response = await GET(new NextRequest(`${BASE_URL}?exercise=${EXERCISE_SLUG}&latest=1`));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("unauthorized");
  });

  it("403: CSRFヘッダ欠落はcsrf_token_invalidを返す", async () => {
    const { cookies } = csrfCookiePair();
    const response = await postSubmission(cookies, validSubmissionBody());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("csrf_token_invalid");
  });

  it("403: CSRFヘッダとcookieが不一致の場合もcsrf_token_invalidを返す", async () => {
    const { cookies } = csrfCookiePair();
    const response = await postSubmission(cookies, validSubmissionBody(), "mismatched-token");
    expect(response.status).toBe(403);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("csrf_token_invalid");
  });

  it("400: バリデーションエラー(不正なlanguage)はvalidation_errorを返す", async () => {
    const { cookies, token } = csrfCookiePair();
    const response = await postSubmission(
      cookies,
      validSubmissionBody({ language: "python" }),
      token,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("validation_error");
  });

  it("413: codeが64KBを超える場合はcode_too_largeを返す", async () => {
    const { cookies, token } = csrfCookiePair();
    const oversizedCode = "a".repeat(64 * 1024 + 1);
    const response = await postSubmission(
      cookies,
      validSubmissionBody({ code: oversizedCode }),
      token,
    );
    expect(response.status).toBe(413);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("code_too_large");
  });

  it("201: ちょうど64KBのcodeは許可される", async () => {
    const { cookies, token } = csrfCookiePair();
    const exactSizeCode = "a".repeat(64 * 1024);
    const response = await postSubmission(
      cookies,
      validSubmissionBody({ code: exactSizeCode }),
      token,
    );
    expect(response.status).toBe(201);
  });

  it("422: サポート対象外のgraderVersionはgrader_version_unsupportedを返す", async () => {
    const { cookies, token } = csrfCookiePair();
    const response = await postSubmission(
      cookies,
      validSubmissionBody({ graderVersion: "99.0.0" }),
      token,
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("grader_version_unsupported");
  });

  it("422: 形式が不正なgraderVersionもgrader_version_unsupportedを返す", async () => {
    const { cookies, token } = csrfCookiePair();
    const response = await postSubmission(
      cookies,
      validSubmissionBody({ graderVersion: "not-a-version" }),
      token,
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe("grader_version_unsupported");
  });

  it("201: 正常な提出は作成されidを返し、GET(latest)で復元できる", async () => {
    const { cookies, token } = csrfCookiePair();
    const postResponse = await postSubmission(cookies, validSubmissionBody(), token);
    expect(postResponse.status).toBe(201);
    const postBody = (await postResponse.json()) as { id: string };
    expect(postBody.id).toBeTruthy();

    const getResponse = await GET(
      new NextRequest(`${BASE_URL}?exercise=${EXERCISE_SLUG}&latest=1`, {
        headers: { cookie: toCookieHeader(cookies) },
      }),
    );
    expect(getResponse.status).toBe(200);
    const getBody = (await getResponse.json()) as {
      submission: { id: string; exerciseSlug: string; result: string; code: string } | null;
    };
    expect(getBody.submission?.id).toBe(postBody.id);
    expect(getBody.submission?.exerciseSlug).toBe(EXERCISE_SLUG);
    expect(getBody.submission?.result).toBe("pass");
  });

  it("GET(latest): 複数提出があるうち最新の1件のみを返す", async () => {
    const { cookies, token } = csrfCookiePair();
    const first = await postSubmission(
      cookies,
      validSubmissionBody({ result: "fail", passedTests: 2, totalTests: 8 }),
      token,
    );
    const firstBody = (await first.json()) as { id: string };

    const second = await postSubmission(
      cookies,
      validSubmissionBody({ result: "pass", passedTests: 8, totalTests: 8 }),
      token,
    );
    const secondBody = (await second.json()) as { id: string };
    expect(secondBody.id).not.toBe(firstBody.id);

    const getResponse = await GET(
      new NextRequest(`${BASE_URL}?exercise=${EXERCISE_SLUG}&latest=1`, {
        headers: { cookie: toCookieHeader(cookies) },
      }),
    );
    const getBody = (await getResponse.json()) as { submission: { id: string; result: string } | null };
    expect(getBody.submission?.id).toBe(secondBody.id);
    expect(getBody.submission?.result).toBe("pass");
  });

  it("GET: 該当する提出が存在しない場合はnullを返す", async () => {
    const getResponse = await GET(
      new NextRequest(`${BASE_URL}?exercise=99-unknown/does-not-exist&latest=1`),
    );
    expect(getResponse.status).toBe(200);
    const getBody = (await getResponse.json()) as { submission: unknown | null };
    expect(getBody.submission).toBeNull();
  });

  it("400: exerciseクエリパラメータ欠落はvalidation_errorを返す", async () => {
    const getResponse = await GET(new NextRequest(BASE_URL));
    expect(getResponse.status).toBe(400);
    const body = (await getResponse.json()) as { title: string };
    expect(body.title).toBe("validation_error");
  });
});
