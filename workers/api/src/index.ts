import { Hono } from "hono";
import type { Context, Next } from "hono";
import type { ProblemDetails } from "../../../lib/contracts";
import type { Env } from "./env";
import { verifySessionCookie } from "./auth";
import { createPrismaClient } from "./db";
import type { PrismaClient } from "@/lib/generated/prisma-workerd/client";
import { progressRoute } from "./routes/progress";
import { submissionsRoute } from "./routes/submissions";
import { dashboardRoute } from "./routes/dashboard";
import { guestProgressImportRoute } from "./routes/guestProgressImport";
import { notesRoute } from "./routes/notes";

/**
 * worker-api。ADR-008(docs/design/09) §2・§4。T-501で骨格(health・JWT検証
 * ミドルウェア)、T-502でprogress/submissions/dashboard/guest-progress/notesの
 * 5ハンドラを移設(移設元は02§3.1のNext.js側Route Handler。notesのみ
 * 移設元のRoute Handlerが未実装だったため新規実装。DBモデル(T-004)と
 * API契約(T-010、lib/contracts/api.ts)は既にマージ済みで、T-307(ノート機能、
 * 03文書「2s debounce自動保存、DOMPurifyサニタイズ」)はクライアントUIのみが
 * 対象範囲のため、このAPI自体はADR-008/T-502のスコープ)。
 */

type Bindings = Env;
type Variables = { userId: string; prisma: PrismaClient };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/health", (c) => c.json({ status: "ok" as const }));

/**
 * 失敗→恒久対策(T-502、db.tsのコメント参照): worker-apiではPrismaClientを
 * リクエストを跨いでキャッシュしない。リクエストごとに新規生成し、レスポンス確定後
 * (finally)に必ず$disconnect()する。
 */
app.use("*", async (c, next) => {
  const prisma = createPrismaClient(c.env);
  c.set("prisma", prisma);
  try {
    await next();
  } finally {
    await prisma.$disconnect();
  }
});

/**
 * ADR-008 §2「worker-apiは同一AUTH_SECRETでCookie内JWTを検証するミドルウェアを持つ」。
 * 401ボディは移設元のNext.js側Route Handler(lib/auth/http.tsのproblemResponse呼び出し
 * 「about:blank#unauthorized」/「unauthorized」)と同一にし、既存の認可挙動を維持する。
 */
async function requireSession(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
  const session = await verifySessionCookie(c.req.header("cookie") ?? null, c.env.AUTH_SECRET);
  if (!session) {
    const problem: ProblemDetails = {
      type: "about:blank#unauthorized",
      title: "unauthorized",
      status: 401,
    };
    return c.json(problem, 401, { "Content-Type": "application/problem+json" });
  }
  c.set("userId", session.userId);
  await next();
}

app.get("/internal/session", requireSession, (c) => c.json({ userId: c.get("userId") }));

app.use("/api/progress", requireSession);
app.route("/api/progress", progressRoute);

app.use("/api/submissions", requireSession);
app.route("/api/submissions", submissionsRoute);

app.use("/api/dashboard", requireSession);
app.route("/api/dashboard", dashboardRoute);

app.use("/api/guest-progress/import", requireSession);
app.route("/api/guest-progress/import", guestProgressImportRoute);

// lessonSlugがスラッシュ区切りの複数セグメント(progress APIのitemSlugと同じ
// 命名規則)のため、他ハンドラと異なりワイルドカードでマウントする。
app.use("/api/notes/*", requireSession);
app.route("/api/notes", notesRoute);

app.notFound((c) => {
  const problem: ProblemDetails = {
    type: "about:blank#not-found",
    title: "not_found",
    status: 404,
  };
  return c.json(problem, 404, { "Content-Type": "application/problem+json" });
});

export default app;
