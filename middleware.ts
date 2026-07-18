import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n/routing";
import { getClientIp, isRateLimited } from "@/lib/auth/rateLimit";

const intlMiddleware = createMiddleware(routing);

/**
 * /api/auth/* (T-005: サインアップ・Auth.jsのsignin/callback・リセット系)は
 * 02§3「レート制限: 認証系 5req/min/IP」を適用し、next-intlのロケール解決は
 * 適用しない(APIレスポンスにロケールリダイレクトは不要)。それ以外は既存どおり
 * next-intlミドルウェアへ委譲する。
 *
 * 対象はPOST(実際に資格情報を検証・変更するアクション: signup/credentials
 * callback/reset request・confirm)のみとする。GET(/api/auth/csrf,
 * /api/auth/providers, /api/auth/session, /api/auth/error等)は資格情報の
 * 総当りに使えない前段の付随リクエストであり、これらも同じ予算に含めると
 * next-auth/reactのsignIn()が1回のサインイン試行で内部的に複数リクエストを
 * 発行するため、正常なユーザーが「パスワードを打ち間違えて2回目を試す」だけで
 * 制限に達し操作不能になる(qa-evaluatorで検出)。
 */
export default function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/auth")) {
    if (request.method === "POST") {
      const ip = getClientIp(request.headers);
      if (isRateLimited(ip)) {
        return NextResponse.json(
          { type: "about:blank#rate-limited", title: "rate_limited", status: 429 },
          {
            status: 429,
            headers: { "Content-Type": "application/problem+json", "Retry-After": "60" },
          },
        );
      }
    }
    return NextResponse.next();
  }
  return intlMiddleware(request);
}

export const config = {
  // _next, api(/api/auth以外), および拡張子付きの静的アセットへのアクセスは
  // ロケール解決の対象外とする。/api/authのみレート制限のため明示的に含める。
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/api/auth/:path*"],
};
