"use client";

import { useMemo, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import { getMessages, formatMessage, type Locale } from "@/lib/i18n/messages";
import type { GlossaryEntry } from "@/lib/glossaryContent";

/**
 * S-08 用語集ページ(T-305, 02§5.4)。content/glossary.yaml由来の全エントリを
 * 一覧表示し、現在言語の用語名+定義に加えもう一方の言語の用語名を併記する
 * (<Term>ポップオーバーと同じ対訳方針)。検索はページ内フィルタ(クライアント側
 * 文字列一致)であり、T-306(FlexSearchによるサイト横断検索)とは別機能。
 */
export function GlossaryPage({
  locale,
  entries,
}: {
  locale: Locale;
  entries: readonly GlossaryEntry[];
}) {
  const t = getMessages(locale).glossary;
  const otherLocale: Locale = locale === "ja" ? "en" : "ja";
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const isComposingRef = useRef(false);

  /**
   * T-305 qa-evaluator検出の恒久対策: IME変換中(日本語入力の未確定文字列)ごとに
   * onChangeが発火しフィルタが再計算されると、確定前のローマ字断片で
   * 「一致する用語が見つかりませんでした」が一瞬明滅する。表示用のinputValueは
   * 毎回更新して入力の応答性を保ちつつ、実フィルタに使うqueryはIME確定
   * (compositionend)後にのみ更新する。
   */
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setInputValue(value);
    if (!isComposingRef.current) {
      setQuery(value);
    }
  }
  function handleCompositionStart() {
    isComposingRef.current = true;
  }
  function handleCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    isComposingRef.current = false;
    setQuery(event.currentTarget.value);
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    if (needle === "") return entries;
    return entries.filter((entry) => {
      const haystack = [
        entry.term[locale],
        entry.term[otherLocale],
        entry.definition[locale],
      ]
        .join("\n")
        .toLocaleLowerCase(locale);
      return haystack.includes(needle);
    });
  }, [entries, locale, otherLocale, query]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.pageTitle}</h1>
      <div className="mb-6">
        <label htmlFor="glossary-search-input" className="mb-1 block text-sm font-medium">
          {t.searchLabel}
        </label>
        <input
          id="glossary-search-input"
          type="search"
          data-testid="glossary-search-input"
          value={inputValue}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={t.searchPlaceholder}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <p role="status" className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {formatMessage(filtered.length === 1 ? t.resultCountOne : t.resultCount, {
            count: filtered.length,
          })}
        </p>
      </div>
      {filtered.length === 0 ? (
        <p data-testid="glossary-empty-state" className="text-sm text-neutral-500 dark:text-neutral-400">
          {t.noResults}
        </p>
      ) : (
        <dl data-testid="glossary-entry-list" className="flex flex-col gap-6">
          {filtered.map((entry) => (
            <div key={entry.slug} data-testid={`glossary-entry-${entry.slug}`}>
              <dt className="font-semibold">{entry.term[locale]}</dt>
              <dd className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {entry.definition[locale]}
              </dd>
              <dd className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                {formatMessage(t.otherLocaleTermLabel, { term: entry.term[otherLocale] })}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}
