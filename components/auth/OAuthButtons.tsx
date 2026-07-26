"use client";

import { signIn } from "next-auth/react";
import { formatMessage, getMessages, type Locale } from "@/lib/i18n/messages";
import type { OAuthProviderId } from "@/lib/auth/providers";

/**
 * 03文書T-005「OAuthは環境変数未設定時にUI非表示となること」。
 * サーバコンポーネント側(各auth配下のpage.tsx)でgetEnabledOAuthProviders()
 * (lib/auth/config.tsのプロバイダ登録と同一の判定源)により決定した一覧のみ
 * propsで受け取り描画する。未設定プロバイダのボタンはそもそもDOMに出力しない。
 */
export function OAuthButtons({
  locale,
  providers,
  callbackUrl,
}: {
  locale: Locale;
  providers: OAuthProviderId[];
  callbackUrl: string;
}) {
  const t = getMessages(locale).auth.oauth;

  if (providers.length === 0) {
    return null;
  }

  return (
    <div data-testid="auth-oauth-buttons" className="flex flex-col gap-2">
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          data-testid={`auth-oauth-${provider}`}
          onClick={() => signIn(provider, { callbackUrl })}
          className="rounded border border-neutral-300 px-4 py-2 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {formatMessage(t.continueWith, { provider: t[provider] })}
        </button>
      ))}
    </div>
  );
}
