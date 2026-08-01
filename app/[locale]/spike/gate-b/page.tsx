import { notFound } from "next/navigation";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { getMessages } from "@/lib/i18n/messages";
import { spikeLessonPreview } from "@/lib/spike/gatingSpikeContent";
import { SpikeGateBBody } from "@/components/spike/SpikeGateBBody";

/**
 * T-601スパイク: 方式B(静的プレビュー+認証付きフェッチ)の最小プロトタイプ。
 * 対象はモジュール2第1レッスン1本のみ(docs/design/10_ADR-009 §4)。本実装ではない
 * (T-602で作り直す前提。PR本文参照)。
 *
 * ページ自体はSSG(冒頭プレビューのみサーバ側に埋め込む)。本文の取得・認可判定は
 * すべてクライアント側の`<SpikeGateBBody>`(worker-api `/api/spike-content/:locale`
 * 経由)に委ねる。このページ自体は`auth()`もPrismaも呼ばない
 * (worker-appのみで完結させないという方式Bの前提を厳密に守る)。
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

export default async function SpikeGateBPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const messages = getMessages(locale).gatingSpike;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>
        {messages.methodBLabel} {"(T-601)"}
      </p>
      <article>
        {spikeLessonPreview[locale].split("\n\n").map((block, i) => (
          <p key={i} style={{ whiteSpace: "pre-wrap" }}>
            {block}
          </p>
        ))}
      </article>
      <SpikeGateBBody
        locale={locale}
        loadingLabel={messages.loadingLabel}
        wallTitle={messages.wall.title}
        wallBody={messages.wall.body}
      />
    </main>
  );
}
