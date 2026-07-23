import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ProblemDetails } from "../../../lib/contracts";

/**
 * lib/auth/http.tsのproblemResponse(NextResponse版)のHono版。
 * 02§3共通仕様「エラーは RFC 9457 Problem Details 形式」。
 */
export function problemResponse(
  c: Context,
  status: ContentfulStatusCode,
  type: string,
  title: string,
  detail?: string,
) {
  const body: ProblemDetails = { type, title, status, ...(detail ? { detail } : {}) };
  return c.json(body, status, { "Content-Type": "application/problem+json" });
}
