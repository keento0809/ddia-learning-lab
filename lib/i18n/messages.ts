import ja from "@/messages/ja.json";
import en from "@/messages/en.json";
import type { AppLocale } from "@/lib/i18n/routing";

/**
 * 「UI文言をハードコードせず messages/{ja,en}.json から取得する」という規約
 * (CLAUDE.md 規則5)を満たすための軽量メッセージ参照ヘルパ。ロケール解決・
 * ルーティング自体は middleware.ts / lib/i18n/routing.ts(next-intl)が担う。
 */

export type Locale = AppLocale;

const catalogs = { ja, en } satisfies Record<Locale, unknown>;

export function getMessages(locale: Locale) {
  return catalogs[locale];
}

export function formatMessage(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in values ? String(values[key]) : `{${key}}`,
  );
}
