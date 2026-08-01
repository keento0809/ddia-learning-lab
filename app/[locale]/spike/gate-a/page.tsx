import type { ComponentType } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { routing, type AppLocale } from "@/lib/i18n/routing";
import { getMessages } from "@/lib/i18n/messages";
import { spikeLessonPreview } from "@/lib/spike/gatingSpikeContent";

/**
 * T-601スパイク: 方式A(動的レンダリング)の最小プロトタイプ。
 * 対象はモジュール2第1レッスン1本のみ(docs/design/10_ADR-009 §4)。
 * 本実装ではない(T-602で作り直す前提。PR本文参照)。
 *
 * `force-dynamic`でJWTセッションをサーバ側decodeし、未認証時は
 * プレビュー文言のみ、認証済みはコンパイル済みMDX全文を描画する。
 * ロケールごとに2つの静的import(ja/en)のみに限定し、既存の
 * `app/[locale]/learn/[module]/[lesson]/page.tsx`のような3変数テンプレート
 * 文字列importは使わない(1レッスンのみが対象のため不要)。
 */
export const dynamic = "force-dynamic";

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

async function loadFullContent(locale: AppLocale): Promise<ComponentType> {
  if (locale === "ja") {
    const mod = await import("@/content/ja/02-data-models/01-relational-vs-document.mdx");
    return mod.default;
  }
  const mod = await import("@/content/en/02-data-models/01-relational-vs-document.mdx");
  return mod.default;
}

export default async function SpikeGateAPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const messages = getMessages(locale).gatingSpike;
  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>
        {messages.methodALabel} {"(T-601)"}
      </p>
      {isAuthenticated ? (
        <FullContentRenderer locale={locale} />
      ) : (
        <>
          <article>
            <PreviewText text={spikeLessonPreview[locale]} />
          </article>
          <section
            role="region"
            aria-label={messages.wall.title}
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              border: "1px solid #8884",
              borderRadius: 8,
            }}
          >
            <p style={{ fontWeight: 600 }}>
              {"🔒 "}
              {messages.wall.title}
            </p>
            <p>{messages.wall.body}</p>
          </section>
        </>
      )}
    </main>
  );
}

async function FullContentRenderer({ locale }: { locale: AppLocale }) {
  const Content = await loadFullContent(locale);
  return (
    <article>
      <Content />
    </article>
  );
}

function PreviewText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n\n").map((block, i) => (
        <p key={i} style={{ whiteSpace: "pre-wrap" }}>
          {block}
        </p>
      ))}
    </>
  );
}
