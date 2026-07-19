"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/messages";

/**
 * レッスン本文(MDX)配下のカスタムコンポーネント(T-103, 02§4.1)向けロケール伝搬。
 * MDX呼び出し側(著者)は7種のコンポーネントにlocale propを渡さない設計(02§4.1の
 * props列にlocaleを含まない)ため、Context経由でLessonLocaleProviderからの値を
 * 各コンポーネントが読む。Server Component(MDX本文自体)はcontextを読めないため、
 * Providerはこのファイル("use client")で提供し、各コンポーネント側はClient
 * Componentとしてこのフックを利用する。
 */
const LessonLocaleContext = createContext<Locale | null>(null);

export function LessonLocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return <LessonLocaleContext.Provider value={locale}>{children}</LessonLocaleContext.Provider>;
}

export function useLessonLocale(): Locale {
  const locale = useContext(LessonLocaleContext);
  if (!locale) {
    throw new Error(
      "useLessonLocale() must be called within a <LessonLocaleProvider> (レッスン本文はLessonLocaleProvider配下でレンダリングする必要があります)",
    );
  }
  return locale;
}
