import { getClientIp } from "../../../../lib/auth/rateLimit";

/**
 * T-705ハードニング後のgetClientIp()を、実workerd(wrangler dev --local)上で
 * そのまま実行する。rawの`cf-connecting-ip`/`x-forwarded-for`ヘッダ値ではなく、
 * アプリ本体が実際に使う識別子導出ロジックの出力を返す。
 */
const handler = {
  async fetch(request: Request): Promise<Response> {
    const h = request.headers;
    return new Response(
      JSON.stringify({
        cfConnectingIp: h.get("cf-connecting-ip"),
        xForwardedFor: h.get("x-forwarded-for"),
        clientIp: getClientIp(h),
      }),
      { headers: { "content-type": "application/json" } },
    );
  },
};

export default handler;
