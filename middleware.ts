import createMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // _next, api, および拡張子付きの静的アセットへのアクセスはロケール解決の対象外とする
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
