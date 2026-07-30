"use client";

import { useAccountQuery } from "@/lib/settings/useAccountQuery";
import { getMessages, type Locale } from "@/lib/i18n/messages";
import { ProfileSection } from "./ProfileSection";
import { PreferencesSection } from "./PreferencesSection";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { SettingsStatus } from "./SettingsStatus";

/**
 * S-10設定画面(T-308、01§7.1)へのGET /api/account接続。
 * components/dashboard/DashboardWithData.tsxと同じ既存パターン
 * (描画コンポーネント本体とデータ取得hookを分離する)。
 */
export function SettingsWithData({ locale }: { locale: Locale }) {
  const t = getMessages(locale).settings;
  const accountQuery = useAccountQuery();

  if (accountQuery.isLoading) {
    return <SettingsStatus locale={locale} kind="loading" />;
  }
  if (accountQuery.isError || !accountQuery.data) {
    return <SettingsStatus locale={locale} kind="error" />;
  }

  const account = accountQuery.data;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-8">
      <h1 className="text-2xl font-semibold">{t.pageTitle}</h1>
      <ProfileSection account={account} locale={locale} />
      <PreferencesSection account={account} locale={locale} />
      <DeleteAccountSection account={account} locale={locale} />
    </main>
  );
}
