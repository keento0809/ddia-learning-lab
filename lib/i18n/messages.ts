import ja from "@/messages/ja.json";
import en from "@/messages/en.json";

/**
 * Walking Skeleton (T-000) 用の最小メッセージ参照ヘルパ。
 * next-intl本体・middlewareによるロケール解決は T-003 の成果物であり、
 * ここでは「UI文言をハードコードせず messages/{ja,en}.json から取得する」
 * という規約(CLAUDE.md 規則5)だけを、貫通確認に必要な範囲で満たす。
 */

export type Locale = "ja" | "en";

const catalogs = { ja, en } satisfies Record<Locale, unknown>;

export function getMessages(locale: Locale) {
  return catalogs[locale];
}

export function formatMessage(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in values ? String(values[key]) : `{${key}}`,
  );
}
