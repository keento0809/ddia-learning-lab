import { Hono } from "hono";
import type { Context } from "hono";
import type { ProblemDetails } from "../../../../lib/contracts";
import type { Env } from "../env";
import { spikeLessonFullPlainText, isSpikeLocale } from "../../../../lib/spike/gatingSpikeContent";

/**
 * T-601スパイク: 方式B(静的プレビュー+認証付きフェッチ)の最小プロトタイプ。
 * 対象はモジュール2第1レッスン1本のみ(docs/design/10_ADR-009 §4)。本実装ではない
 * (T-602で作り直す前提。PR本文参照)。マウント元(../index.ts)で
 * `requireSession`を適用済みのため、ここに到達した時点でJWT検証済み。
 *
 * 本文はビルド時生成物ではなくソース定数(lib/spike/gatingSpikeContent.ts)を
 * そのまま使う。worker-apiは`node:fs`をリクエスト処理経路で使えない
 * (lib/content.tsのコメント参照)ため、本番実装(T-602)ではR2/KV等への
 * 置き場を別途検討する前提(ADR-009 §4の懸念点そのもの)。
 */

type Bindings = Env;
type Variables = { userId: string };

export const spikeContentRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

spikeContentRoute.get(
  "/:locale",
  (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const locale = c.req.param("locale");
    if (!locale || !isSpikeLocale(locale)) {
      const problem: ProblemDetails = {
        type: "about:blank#validation-error",
        title: "validation_error",
        status: 400,
      };
      return c.json(problem, 400, { "Content-Type": "application/problem+json" });
    }
    return c.json({ body: spikeLessonFullPlainText[locale] });
  },
);
