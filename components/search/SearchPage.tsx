"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import { Link } from "@/lib/i18n/navigation";
import { getMessages, formatMessage, type Locale } from "@/lib/i18n/messages";
import { loadSearchIndex, searchDocuments, type SearchIndex } from "@/lib/search/flexIndex";
import type { SearchDocumentKind } from "@/lib/search/types";

/**
 * ヘッダーの言語トグル(components/LocaleToggle.tsx)は`usePathname()`(クエリ文字列を
 * 含まないルート内相対パス)を使って他ロケールへ遷移するため、`/ja/search?q=...`から
 * 切り替えると常に`/en/search`(クエリなし)へ着地し、SearchPageは新規マウントされる
 * (qa-evaluator実機検証で検出: 検索中に言語トグルを押すと入力・結果が消える)。
 * LocaleToggleは全ページ共通のヘッダー部品でありT-306の成果物ではないため変更せず、
 * 検索クエリをsessionStorageに退避してこのコンポーネント自身の再マウント時に復元する
 * ことで対処する(タブを閉じるまでの間、ロケール往復してもcrashしない)。
 */
const SEARCH_QUERY_STORAGE_KEY = "ddia-search-last-query";

function readStoredQuery(): string {
  try {
    return window.sessionStorage.getItem(SEARCH_QUERY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredQuery(query: string): void {
  try {
    if (query === "") {
      window.sessionStorage.removeItem(SEARCH_QUERY_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(SEARCH_QUERY_STORAGE_KEY, query);
    }
  } catch {
    // sessionStorageが使えない(プライベートブラウジング等)場合は状態保持を諦めるのみ
  }
}

/**
 * S-09 検索結果画面(T-306, 01基本設計書 画面一覧「コンテンツ横断検索」、02§9)。
 * ビルド時生成済みのロケール別FlexSearchインデックス(lib/generated/search-index.{locale}.json、
 * scripts/generate-curriculum.tsのgenerateSearchIndex)を、現在のロケール分のみ動的import
 * することでコード分割する(both localesを静的importすると常に両言語分(合計約4MB)を
 * 送信してしまうため、02§12-4「静的JSON分割」の意図に反する)。
 *
 * 入力のIME対応はGlossaryPage(T-305)と同じ方針: 表示用inputValueは毎回更新しつつ、
 * 実検索に使うqueryはIME確定(compositionend)後にのみ更新し、変換中の断片一致による
 * ちらつきを防ぐ。
 *
 * T-604(ADR-009 §6)。検索インデックスは静的アセットとして配信されるため
 * (認証チェックを経由するAPIではない)、認証状態に応じて配信するJSON自体を
 * 切り替える: `isAuthenticated`が偽なら既定(Gated階層のレッスン本文を含まない)
 * `search-index.{locale}.json`を、真なら全文を含む
 * `search-index-authenticated.{locale}.json`を動的importする
 * (両方とも`scripts/generate-curriculum.ts`のgenerateSearchIndexが生成)。
 * `isAuthenticated`は`app/[locale]/search/page.tsx`(Server Component)が
 * `auth()`で解決した結果をpropとして渡す(quiz/labページと同じ既存パターン)。
 */
export function SearchPage({
  locale,
  initialQuery,
  isAuthenticated = false,
}: {
  locale: Locale;
  initialQuery: string;
  isAuthenticated?: boolean;
}) {
  const t = getMessages(locale).search;
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const isComposingRef = useRef(false);

  // 初回マウント時のみ: URLにクエリが無ければ、直前のロケール切替前に入力していた
  // 検索語をsessionStorageから復元する(SSR/初回描画とのハイドレーション不整合を
  // 避けるため、初期state(useState)ではなくマウント後のuseEffectで行う)。
  useEffect(() => {
    if (initialQuery !== "") return;
    const stored = readStoredQuery();
    if (stored !== "") {
      setInputValue(stored);
      setQuery(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    writeStoredQuery(query.trim());
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setIndex(null);
    setLoadError(false);

    const importIndex = isAuthenticated
      ? locale === "ja"
        ? import("@/lib/generated/search-index-authenticated.ja.json")
        : import("@/lib/generated/search-index-authenticated.en.json")
      : locale === "ja"
        ? import("@/lib/generated/search-index.ja.json")
        : import("@/lib/generated/search-index.en.json");

    importIndex
      .then((mod) => {
        if (cancelled) return;
        setIndex(loadSearchIndex(locale, mod.default));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [locale, isAuthenticated]);

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

  const trimmedQuery = query.trim();
  const results = useMemo(() => {
    if (!index || trimmedQuery === "") return [];
    return searchDocuments(index, locale, trimmedQuery);
  }, [index, locale, trimmedQuery]);

  const kindLabel: Record<SearchDocumentKind, string> = {
    module: t.kindLabel.module,
    lesson: t.kindLabel.lesson,
    glossary: t.kindLabel.glossary,
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.pageTitle}</h1>
      <div className="mb-6">
        <label htmlFor="search-input" className="mb-1 block text-sm font-medium">
          {t.inputLabel}
        </label>
        <input
          id="search-input"
          type="search"
          data-testid="search-input"
          value={inputValue}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={t.inputPlaceholder}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        {index && trimmedQuery !== "" && (
          <p role="status" className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {formatMessage(results.length === 1 ? t.resultCountOne : t.resultCount, {
              count: results.length,
            })}
          </p>
        )}
      </div>

      {loadError ? (
        <p data-testid="search-load-error" className="text-sm text-red-600 dark:text-red-400">
          {t.loadErrorLabel}
        </p>
      ) : !index ? (
        <p data-testid="search-loading" className="text-sm text-neutral-500 dark:text-neutral-400">
          {t.loadingLabel}
        </p>
      ) : trimmedQuery === "" ? (
        <p data-testid="search-prompt" className="text-sm text-neutral-500 dark:text-neutral-400">
          {t.promptLabel}
        </p>
      ) : results.length === 0 ? (
        <p data-testid="search-empty-state" className="text-sm text-neutral-500 dark:text-neutral-400">
          {t.noResults}
        </p>
      ) : (
        <ul data-testid="search-result-list" className="flex flex-col gap-6">
          {results.map((hit) =>
            hit.doc ? (
              <li key={hit.id} data-testid={`search-result-${hit.id}`}>
                <Link href={hit.doc.href} className="font-semibold hover:underline">
                  {hit.doc.title}
                </Link>
                <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  {kindLabel[hit.doc.kind]}
                </span>
                {hit.doc.excerpt !== hit.doc.title && (
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {hit.doc.excerpt}
                  </p>
                )}
              </li>
            ) : null,
          )}
        </ul>
      )}
    </main>
  );
}
