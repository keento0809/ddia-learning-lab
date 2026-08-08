import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n/routing";
import { getClientIp, isAuthRateLimited } from "@/lib/auth/rateLimit";
import { buildMainPageCsp } from "@/lib/security/csp";

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
 *
 * T-705 Medium #4(docs/security/findings.md): `isAuthRateLimited`
 * (lib/auth/rateLimit.ts)経由にすることで、実デプロイ環境ではCloudflare
 * Rate Limiting APIバインディング(isolate間で状態を共有)を優先し、
 * バインディングに到達できない環境(next dev単体・vitest)ではisolate単位の
 * インメモリフォールバックへ委譲する。
 */
export default async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/auth")) {
    if (request.method === "POST") {
      const ip = getClientIp(request.headers);
      if (await isAuthRateLimited(ip)) {
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
  const response = intlMiddleware(request);
  // T-704(ADR-010 §3.4 CF-1): この分岐は`config.matcher`によりページルートのみに
  // 絞られている(/api(/api/authを除く)・_next・拡張子付き静的アセットは対象外)ため、
  // ここでCSPを付与すれば実質的に全ページに適用される。演習実行Worker
  // (harness.worker.ts等)には別の、より厳格なCSP(connect-src 'none')を
  // `_headers`経由で適用する(scripts/generate-worker-csp-headers.mjs)。
  response.headers.set("Content-Security-Policy", buildMainPageCsp());
  return response;
}

export const config = {
  // _next, api(/api/auth以外), および拡張子付きの静的アセットへのアクセスは
  // ロケール解決の対象外とする。/api/authのみレート制限のため明示的に含める。
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/api/auth/:path*"],
};
