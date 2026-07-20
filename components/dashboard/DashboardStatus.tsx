import { getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * S-07 ダッシュボードの読み込み中/エラー状態(T-112 qa-evaluator指摘対応)。
 * GET /api/dashboardが未解決/失敗の間もDashboard本体(0件のダミー値)を
 * そのまま描画すると、実際の「進捗ゼロ」と「読み込み中/失敗」が画面上
 * 区別できず、通信障害時に誤った空状態を事実として見せてしまう。
 */
export function DashboardStatus({ locale, kind }: { locale: Locale; kind: "loading" | "error" }) {
  const t = getMessages(locale).dashboard;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.pageTitle}</h1>
      <p
        role={kind === "error" ? "alert" : "status"}
        data-testid={kind === "error" ? "dashboard-error" : "dashboard-loading"}
        className="text-sm text-neutral-600 dark:text-neutral-400"
      >
        {kind === "error" ? t.loadError : t.loading}
      </p>
    </main>
  );
}
