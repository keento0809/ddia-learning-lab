"use client";

import { useState, type FormEvent } from "react";
import type { AccountRecord, LocalePref, ThemePref } from "@/lib/settings/schemas";
import { useUpdateAccountMutation } from "@/lib/settings/useUpdateAccountMutation";
import { useThemeStore } from "@/lib/store/themeStore";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { getMessages, type Locale } from "@/lib/i18n/messages";

/**
 * S-10設定画面「言語既定値(locale_pref)・テーマ既定値(theme_pref)」(T-308、01§7.1)。
 *
 * locale_pref保存後、現在表示中のロケールと異なる場合はLocaleToggle
 * (components/LocaleToggle.tsx)と同じrouter.push(pathname, { locale })で
 * 即座に切り替える(NEXT_LOCALE cookie同期も含め、既存の言語トグルと同じ経路に
 * 乗せて二重実装を避ける)。
 *
 * theme_prefは"system"を含む3値だが、既存のライブ切替(ThemeToggle/useThemeStore、
 * T-007スコープで先行実装済み)は"light"/"dark"の2値のみを扱う設計のため、
 * "system"選択時はDBへの既定値保存のみ行い、ライブ表示の切替は行わない
 * (useThemeStoreへの"system"導入は本タスクのスコープ外の拡張になるため)。
 *
 * qa-evaluator指摘対応: locale_pref/theme_prefはこの画面・APIハンドラ以外の
 * どこからも読まれない(ログイン時のロケール決定やテーマ初期化スクリプトは
 * 別経路のCookie/localStorageのみで完結する)ため、「既定値」と称しても
 * 次回サインイン時や別端末・別ブラウザには反映されない。この実効範囲を
 * scopeNoteとして正直に開示する(以前は開示が無く、その後「今この画面のみ」と
 * いう不正確な文言を経て、実際の永続範囲・非永続範囲を正確に記述する文言へ
 * 訂正した)。
 */
export function PreferencesSection({ account, locale }: { account: AccountRecord; locale: Locale }) {
  const t = getMessages(locale).settings.preferences;
  const [localePref, setLocalePref] = useState<LocalePref>(account.localePref);
  const [themePref, setThemePref] = useState<ThemePref>(account.themePref);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const mutation = useUpdateAccountMutation();
  const setTheme = useThemeStore((state) => state.setTheme);
  const pathname = usePathname();
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    try {
      await mutation.mutateAsync({ localePref, themePref });
      if (themePref === "light" || themePref === "dark") {
        setTheme(themePref);
      }
      setStatus("saved");
      if (localePref !== locale) {
        router.push(pathname, { locale: localePref });
      }
    } catch {
      setErrorMessage(t.errorGeneric);
      setStatus("error");
    }
  }

  return (
    <section aria-labelledby="settings-preferences-heading" className="flex flex-col gap-4">
      <h2 id="settings-preferences-heading" className="text-lg font-semibold">
        {t.heading}
      </h2>
      <p data-testid="settings-preferences-scope-note" className="text-sm text-neutral-600 dark:text-neutral-400">
        {t.scopeNote}
      </p>
      <form
        onSubmit={handleSubmit}
        data-testid="settings-preferences-form"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="settings-locale-pref" className="text-sm font-medium">
            {t.localeLabel}
          </label>
          <select
            id="settings-locale-pref"
            value={localePref}
            onChange={(event) => {
              setLocalePref(event.target.value as LocalePref);
              setStatus("idle");
            }}
            data-testid="settings-locale-pref-select"
            className="w-full max-w-sm rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          >
            <option value="ja">{t.localeOptions.ja}</option>
            <option value="en">{t.localeOptions.en}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="settings-theme-pref" className="text-sm font-medium">
            {t.themeLabel}
          </label>
          <select
            id="settings-theme-pref"
            value={themePref}
            onChange={(event) => {
              setThemePref(event.target.value as ThemePref);
              setStatus("idle");
            }}
            data-testid="settings-theme-pref-select"
            className="w-full max-w-sm rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          >
            <option value="system">{t.themeOptions.system}</option>
            <option value="light">{t.themeOptions.light}</option>
            <option value="dark">{t.themeOptions.dark}</option>
          </select>
        </div>
        {status === "error" && (
          <p
            role="alert"
            data-testid="settings-preferences-error"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {errorMessage}
          </p>
        )}
        {status === "saved" && (
          <p data-testid="settings-preferences-saved" className="text-sm text-emerald-700 dark:text-emerald-400">
            {t.saved}
          </p>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          data-testid="settings-preferences-submit"
          className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {mutation.isPending ? t.saving : t.save}
        </button>
      </form>
    </section>
  );
}
