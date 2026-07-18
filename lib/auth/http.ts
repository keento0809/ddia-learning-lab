import { NextResponse } from "next/server";
import type { ProblemDetails } from "@/lib/contracts";

/**
 * 02§3共通仕様「エラーは RFC 9457 Problem Details 形式」に従うレスポンス生成。
 * https://www.rfc-editor.org/rfc/rfc9457
 */
export function problemResponse(
  status: number,
  type: string,
  title: string,
  detail?: string,
): NextResponse<ProblemDetails> {
  return NextResponse.json(
    { type, title, status, ...(detail ? { detail } : {}) },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
