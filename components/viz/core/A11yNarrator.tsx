import { getMessages, type Locale } from "@/lib/i18n/messages";
import type { A11yNarratable } from "@/lib/contracts";

export interface A11yNarratorProps<S> {
  state: S;
  locale: Locale;
  narratable: A11yNarratable<S>;
  politeness?: "polite" | "assertive";
}

/**
 * Viz共通のaria-live読み上げ領域(02§8.1 A11yNarrator「状態遷移を aria-live
 * テキストで読み上げ」)。表示テキストは各Vizが実装する
 * describeState(state, locale)(02§8.1「各Vizは実装必須」)から取得する。
 * 視覚的には非表示(sr-only)で、スクリーンリーダーにのみ通知する。
 */
export function A11yNarrator<S>({
  state,
  locale,
  narratable,
  politeness = "polite",
}: A11yNarratorProps<S>) {
  const t = getMessages(locale).vizCore.narrator;
  const text = narratable.describeState(state, locale);

  return (
    <div aria-live={politeness} aria-label={t.ariaLabel} role="status" data-testid="viz-a11y-narrator" className="sr-only">
      {text}
    </div>
  );
}
