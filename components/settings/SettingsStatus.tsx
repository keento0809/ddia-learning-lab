import { getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * S-10設定画面の読み込み中/エラー状態(components/dashboard/DashboardStatus.tsxと
 * 同じ方針。qa-evaluator指摘対応: GET /api/account未解決/失敗の間に空フォームを
 * 表示すると「未入力」と「読み込み中/失敗」が区別できないため分離する)。
 */
export function SettingsStatus({ locale, kind }: { locale: Locale; kind: "loading" | "error" }) {
  const t = getMessages(locale).settings;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.pageTitle}</h1>
      <p
        role={kind === "error" ? "alert" : "status"}
        data-testid={kind === "error" ? "settings-error" : "settings-loading"}
        className="text-sm text-neutral-600 dark:text-neutral-400"
      >
        {kind === "error" ? t.loadError : t.loading}
      </p>
    </main>
  );
}
