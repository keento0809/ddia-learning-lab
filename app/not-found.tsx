import { getMessages } from "@/lib/i18n/messages";
import { routing } from "@/lib/i18n/routing";
import "./globals.css";

/**
 * middleware.ts が既定ロケール(en)への307リダイレクトを行うため通常は
 * 到達しないが、Next.jsのapp router規約上ルート直下にnot-found.tsxが
 * 必要となるケース(不正なロケールセグメント等)への最終フォールバック。
 * ロケール文脈(NextIntlClientProvider)を持たないため、messages/{ja,en}.json
 * のうち既定ロケール(en)のカタログをそのまま関数参照で使う(rule5: UI文言の
 * ハードコード禁止に対応するため、この最終フォールバックでも直書き文字列は
 * 使わない)。app/[locale]/layout.tsxを経由しないルート(このファイル自体が
 * <html>を持つ)ためglobals.cssを直接importする。
 */
export default function RootNotFound() {
  const t = getMessages(routing.defaultLocale).notFound;

  return (
    <html lang={routing.defaultLocale}>
      <body>
        <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-neutral-600">{t.description}</p>
          <a
            href={`/${routing.defaultLocale}`}
            className="rounded bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700"
          >
            {t.homeLinkLabel}
          </a>
        </main>
      </body>
    </html>
  );
}
