import { Hono } from "hono";
import type { Context, Next } from "hono";
import type { ProblemDetails } from "../../../lib/contracts";
import type { Env } from "./env";
import { verifySessionCookie } from "./auth";

/**
 * worker-api の骨格。ADR-008(docs/design/09) §2・§4 T-501。
 * 既存APIハンドラの移設はT-502のスコープのため、ここでは
 * health・JWT検証ミドルウェアのみを実装する。
 */

type Bindings = Env;
type Variables = { userId: string };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/health", (c) => c.json({ status: "ok" as const }));

/**
 * ADR-008 §2「worker-apiは同一AUTH_SECRETでCookie内JWTを検証するミドルウェアを持つ」。
 * T-502/T-503で移設される各APIハンドラはこのミドルウェアを前段に置く想定。
 */
async function requireSession(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
  const session = await verifySessionCookie(c.req.header("cookie") ?? null, c.env.AUTH_SECRET);
  if (!session) {
    const problem: ProblemDetails = {
      type: "about:blank#unauthenticated",
      title: "unauthenticated",
      status: 401,
    };
    return c.json(problem, 401, { "Content-Type": "application/problem+json" });
  }
  c.set("userId", session.userId);
  await next();
}

/**
 * requireSession の骨格レベルの動作確認用エンドポイント。T-502で移設される
 * 実APIハンドラの前段ミドルウェアとしての利用はT-502のスコープ。
 */
app.get("/internal/session", requireSession, (c) => c.json({ userId: c.get("userId") }));

app.notFound((c) => {
  const problem: ProblemDetails = {
    type: "about:blank#not-found",
    title: "not_found",
    status: 404,
  };
  return c.json(problem, 404, { "Content-Type": "application/problem+json" });
});

export default app;
